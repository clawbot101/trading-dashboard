import { query } from '../db';
import { DEFAULT_ARCHIVED_STRATEGIES } from '../archived-strategies-store';

/** Distinct strategy_name values seen in trading data (sessions + live state). */
export async function listKnownStrategyNames(): Promise<string[]> {
  const rows = await query<{ strategy_name: string }>(
    `
      SELECT DISTINCT strategy_name
      FROM (
        SELECT strategy_name
        FROM trading_sessions
        WHERE strategy_name IS NOT NULL AND strategy_name <> ''
        UNION
        SELECT strategy_name
        FROM trading_state
        WHERE strategy_name IS NOT NULL AND strategy_name <> ''
      ) names
      ORDER BY strategy_name ASC
    `
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...DEFAULT_ARCHIVED_STRATEGIES, ...rows.map((r) => r.strategy_name)]) {
    const n = String(name || '').trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.sort();
}
