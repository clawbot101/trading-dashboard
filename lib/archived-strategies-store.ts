/**
 * Persist which strategy_name values are archived (hidden from the live dashboard).
 * Vercel: optional Postgres row (table must exist; connection is often read-only).
 * VM dev: JSON beside gp-trading-algo state.
 */

import fs from 'fs/promises';
import path from 'path';
import { query, queryOne } from './db';

export const DEFAULT_ARCHIVED_STRATEGIES: readonly string[] = [
  'hip3_xsec_skip_momentum',
  'xsec_macd_hl_dryrun',
  'nansen_single_perp',
];

const SETTINGS_KEY = 'archived_strategies';

type StoreFile = {
  archived: string[];
  updated_at?: string;
};

function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.TIMESCALEDB_TRADING_URL);
}

function storePath(): string {
  if (process.env.ARCHIVED_STRATEGIES_PATH) {
    return process.env.ARCHIVED_STRATEGIES_PATH;
  }
  return path.resolve(
    process.cwd(),
    '..',
    'gp-trading-algo',
    'state',
    'archived-strategies.json'
  );
}

function normalize(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out.sort();
}

function isReadOnlyDbError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === '25006' || code === '42501';
}

function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === '42P01';
}

let memoryCache: string[] | null = null;
let tableEnsureAttempted = false;

export function invalidateArchivedStrategiesCache(): void {
  memoryCache = null;
}

/** Best-effort DDL; skipped after first failure (e.g. read-only replica). */
async function ensureSettingsTable(): Promise<boolean> {
  if (!hasDatabase() || tableEnsureAttempted) return false;
  tableEnsureAttempted = true;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS dashboard_settings (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    return true;
  } catch (err) {
    if (isReadOnlyDbError(err)) return false;
    throw err;
  }
}

async function readDb(): Promise<StoreFile | null> {
  if (!hasDatabase()) return null;
  try {
    const row = await queryOne<{ value: { archived?: string[] }; updated_at: string }>(
      `
        SELECT value, updated_at::text AS updated_at
        FROM dashboard_settings
        WHERE key = $1
      `,
      [SETTINGS_KEY]
    );
    if (!row?.value || !Array.isArray(row.value.archived)) return null;
    return {
      archived: normalize(row.value.archived),
      updated_at: row.updated_at,
    };
  } catch (err) {
    if (isMissingTableError(err) || isReadOnlyDbError(err)) return null;
    throw err;
  }
}

async function writeDb(archived: string[]): Promise<StoreFile> {
  await ensureSettingsTable();
  const payload = normalize(archived);
  const updated_at = new Date().toISOString();
  try {
    await query(
      `
        INSERT INTO dashboard_settings (key, value, updated_at)
        VALUES ($1, $2::jsonb, $3::timestamptz)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
      `,
      [SETTINGS_KEY, JSON.stringify({ archived: payload }), updated_at]
    );
    return { archived: payload, updated_at };
  } catch (err) {
    if (isReadOnlyDbError(err) || isMissingTableError(err)) {
      throw new Error(
        'Database is read-only or dashboard_settings is missing. Create the table on the primary DB or use the JSON file on the VM.'
      );
    }
    throw err;
  }
}

async function readFile(): Promise<StoreFile | null> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8');
    const parsed = JSON.parse(raw) as StoreFile;
    if (!parsed || !Array.isArray(parsed.archived)) return null;
    return { archived: normalize(parsed.archived), updated_at: parsed.updated_at };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return null;
    throw err;
  }
}

async function writeFile(archived: string[]): Promise<StoreFile> {
  const file = storePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload: StoreFile = {
    archived: normalize(archived),
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

async function loadStored(): Promise<StoreFile | null> {
  const fromFile = await readFile();
  if (fromFile) return fromFile;
  return readDb();
}

export async function getArchivedStrategies(): Promise<string[]> {
  if (memoryCache) return memoryCache;
  const stored = await loadStored();
  memoryCache = stored ? stored.archived : [...DEFAULT_ARCHIVED_STRATEGIES];
  return memoryCache;
}

export async function setArchivedStrategies(archived: string[]): Promise<StoreFile> {
  const normalized = normalize(archived);
  let payload: StoreFile;
  if (hasDatabase()) {
    payload = await writeDb(normalized);
  } else {
    payload = await writeFile(normalized);
  }
  if (hasDatabase()) {
    try {
      await writeFile(normalized);
    } catch {
      // Optional JSON mirror on VM; Vercel has no writable sibling path.
    }
  }
  memoryCache = payload.archived;
  return payload;
}

export async function getArchivedStrategiesStore(): Promise<{
  archived: string[];
  defaults: string[];
  path: string;
  updated_at: string | null;
}> {
  const stored = await loadStored();
  return {
    archived: stored ? stored.archived : [...DEFAULT_ARCHIVED_STRATEGIES],
    defaults: [...DEFAULT_ARCHIVED_STRATEGIES],
    path: hasDatabase() ? 'dashboard_settings.archived_strategies' : storePath(),
    updated_at: stored?.updated_at ?? null,
  };
}
