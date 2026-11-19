/**
 * Daily L2/L4 target books parsed from gp-trading-algo strategy logs.
 * These are the signal-day sleeves (not the L4 5-day combined book).
 */

import fs from 'fs/promises';
import path from 'path';

export interface LiveBookRow {
  book: 'l2_galaxy_rank' | 'l4_bot_fade';
  label: 'L2' | 'L4';
  signal_day: string;
  run_day: string;
  cycle_start: string;
  status: 'traded' | 'held';
  reason: string | null;
  longs: string[];
  shorts: string[];
}

const START_RE =
  /Starting strategy cycle for (l2_galaxy_rank|l4_bot_fade)\. Run ID: (run_[^.]+)\. Start time: ([^+]+\+00:00)/;
const SIGNAL_RE = /(l2_galaxy_rank|l4_bot_fade) signal_day=([0-9-]+):(.*)/;
const HELD_RE =
  /LC_BOOK book=(l2_galaxy_rank|l4_bot_fade) run_day=([0-9-]+) signal_day=([0-9-]+).*?phase=(\S+) reason=(\S+)/;

let cache: { stamp: number; rows: LiveBookRow[] } | null = null;

function logDir(): string {
  if (process.env.ALGO_LOG_DIR) return process.env.ALGO_LOG_DIR;
  return path.resolve(process.cwd(), '../gp-trading-algo/logs');
}

function tickers(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim().split('/')[0])
    .filter(Boolean);
}

function listAfter(rest: string, key: string): string[] {
  const match = rest.match(new RegExp(`${key}=([^;]+)`));
  return tickers(match?.[1]);
}

function labelFor(book: LiveBookRow['book']): LiveBookRow['label'] {
  return book === 'l2_galaxy_rank' ? 'L2' : 'L4';
}

function lineTime(line: string): string | null {
  const match = line.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  return `${match[1]}T${match[2]}.000Z`;
}

function upsert(map: Map<string, LiveBookRow>, row: LiveBookRow) {
  const key = `${row.book}|${row.signal_day}`;
  const prev = map.get(key);
  if (!prev) {
    map.set(key, row);
    return;
  }
  if (prev.status === 'traded' && row.status === 'held') return;
  if (prev.status === 'held' && row.status === 'traded') {
    map.set(key, row);
    return;
  }
  if (row.cycle_start >= prev.cycle_start) map.set(key, row);
}

async function parseLogs(): Promise<LiveBookRow[]> {
  const dir = logDir();
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.log') && !name.includes('dryrun'));
  let stamp = 0;
  const files: string[] = [];
  for (const name of names) {
    const full = path.join(dir, name);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    files.push(full);
    if (stat.mtimeMs > stamp) stamp = stat.mtimeMs;
  }
  if (cache && cache.stamp === stamp) return cache.rows;

  const map = new Map<string, LiveBookRow>();
  for (const full of files) {
    const text = await fs.readFile(full, 'utf8');
    let current: { book: LiveBookRow['book']; cycleStart: string } | null = null;
    for (const line of text.split('\n')) {
      const started = line.match(START_RE);
      if (started) {
        current = {
          book: started[1] as LiveBookRow['book'],
          cycleStart: new Date(started[3]).toISOString(),
        };
        continue;
      }

      const signal = line.match(SIGNAL_RE);
      if (signal) {
        const book = signal[1] as LiveBookRow['book'];
        const rest = signal[3];
        const loggedAt = lineTime(line);
        const cycleStart =
          current && current.book === book && current.cycleStart
            ? current.cycleStart
            : loggedAt;
        if (!cycleStart) continue;
        const longs = book === 'l2_galaxy_rank' ? listAfter(rest, 'long') : listAfter(rest, 'hedge');
        const shorts = listAfter(rest, 'short');
        if (longs.length === 0 && shorts.length === 0) continue;
        upsert(map, {
          book,
          label: labelFor(book),
          signal_day: signal[2],
          run_day: cycleStart.slice(0, 10),
          cycle_start: cycleStart,
          status: 'traded',
          reason: null,
          longs,
          shorts,
        });
        continue;
      }

      const held = line.match(HELD_RE);
      if (held && held[4] !== 'execute_targets') {
        const book = held[1] as LiveBookRow['book'];
        const cycleStart = lineTime(line) ?? `${held[2]}T00:00:00.000Z`;
        upsert(map, {
          book,
          label: labelFor(book),
          signal_day: held[3],
          run_day: held[2],
          cycle_start: cycleStart,
          status: 'held',
          reason: held[5],
          longs: [],
          shorts: [],
        });
      }
    }
  }

  const rows = [...map.values()].sort((a, b) => {
    if (a.signal_day !== b.signal_day) return a.signal_day < b.signal_day ? 1 : -1;
    if (a.label !== b.label) return a.label < b.label ? -1 : 1;
    return a.cycle_start < b.cycle_start ? 1 : -1;
  });
  cache = { stamp, rows };
  return rows;
}

function dayInRange(day: string, fromTs: string, toTs: string): boolean {
  const fromDay = fromTs.slice(0, 10);
  const toDay = toTs.slice(0, 10);
  return day >= fromDay && day <= toDay;
}

export async function getLiveBooks(
  fromTs: string,
  toTs: string,
  book: 'all' | 'l2' | 'l4' = 'all'
): Promise<LiveBookRow[]> {
  const rows = await parseLogs();
  return rows.filter((row) => {
    if (book === 'l2' && row.book !== 'l2_galaxy_rank') return false;
    if (book === 'l4' && row.book !== 'l4_bot_fade') return false;
    return dayInRange(row.signal_day, fromTs, toTs) || dayInRange(row.run_day, fromTs, toTs);
  });
}
