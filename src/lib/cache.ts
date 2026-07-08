// ─────────────────────────────────────────────────────
// Thin typed wrapper around the Redis client used by our
// BullMQ workers. Provides a small "getOrSet" + invalidate
// surface for short-lived per-user aggregations such as the
// dashboard summary.
//
// We deliberately keep this minimal — full-text search,
// session caching, etc. belong in their own modules.
// ─────────────────────────────────────────────────────
import { redis } from './redis';

const DEFAULT_TTL_SECONDS = 60;

/**
 * Cache a JSON-serializable value under `key` for `ttlSeconds`,
 * executing `loader` if the key is missing or the cache is unreachable.
 * Cache misses never throw — they fall through to the loader so a
 * Redis outage degrades gracefully.
 */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached !== null && cached !== undefined) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // Corrupt cache entry — ignore and reload.
      }
    }
  } catch {
    // Redis is down — skip cache, fall back to loader.
  }

  const fresh = await loader();

  try {
    await redis.set(key, JSON.stringify(fresh), 'EX', ttlSeconds);
  } catch {
    // Persisting failed — caller still gets a valid response.
  }

  return fresh;
}

/** Delete one or many keys; missing keys are ignored. */
export async function invalidate(key: string | string[]): Promise<void> {
  const keys = Array.isArray(key) ? key : [key];
  try {
    await redis.del(...keys);
  } catch {
    // Best-effort; the next read will repopulate.
  }
}

/**
 * Pattern-based invalidation. Scans the keyspace and deletes any key
 * matching `pattern` (Redis "KEYS pattern" semantics). Use sparingly —
 * prefer targeted `invalidate()` calls in hot paths.
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = next;
      if (batch.length > 0) {
        await redis.del(...batch);
      }
    } while (cursor !== '0');
  } catch {
    // Best-effort.
  }
}

export const CACHE_TTL = {
  DASHBOARD_SUMMARY: 60,
  RESUMES_LIST: 30,
  TEMPLATES_LIST: 300,
} as const;
