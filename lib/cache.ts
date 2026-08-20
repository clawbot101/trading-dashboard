/**
 * Small in-process response cache with single-flight.
 *
 * The overview queries aggregate a lot of history against a single-CPU database.
 * Without this, every poll from every browser tab (and every Vercel instance that
 * happens to serve it) starts its own full recomputation; once those overlap they
 * slow each other down, time out, get retried, and the database never catches up.
 *
 * Three behaviours matter here:
 * - TTL: repeat requests inside the window reuse the last result.
 * - Single-flight: concurrent misses for the same key await one computation.
 * - Stale fallback: if a refresh fails, the last good value is served instead of
 *   surfacing an error, which is what turns a slow database into a blank page.
 */

type Entry<T> = { value: T; expiresAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __responseCache: Map<string, Entry<unknown>> | undefined;
  // eslint-disable-next-line no-var
  var __responseCacheInflight: Map<string, Promise<unknown>> | undefined;
}

const store = global.__responseCache ?? new Map<string, Entry<unknown>>();
const inflight = global.__responseCacheInflight ?? new Map<string, Promise<unknown>>();

if (process.env.NODE_ENV !== 'production') {
  global.__responseCache = store;
  global.__responseCacheInflight = inflight;
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const run = (async () => {
    try {
      const value = await fn();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch (err) {
      if (hit) return hit.value;
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, run);
  return run;
}
