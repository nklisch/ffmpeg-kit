export interface CacheOptions {
  /** Maximum number of entries (default: 100) */
  maxSize?: number;
  /** Time-to-live in milliseconds (default: 300_000 = 5 min) */
  ttlMs?: number;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface CacheInstance<K, V> {
  /** Get a cached value. Returns undefined if expired or missing. */
  get(key: K): V | undefined;
  /** Set a value in the cache. */
  set(key: K, value: V): void;
  /** Check if a non-expired entry exists. */
  has(key: K): boolean;
  /** Delete a specific entry. */
  delete(key: K): boolean;
  /** Clear all entries. */
  clear(): void;
  /** Current number of non-expired entries. */
  readonly size: number;
}

/**
 * Generic TTL + LRU cache.
 * - Entries expire after `ttlMs` milliseconds.
 * - When `maxSize` is reached, the least-recently-used entry is evicted.
 * - `get()` refreshes LRU order but does NOT extend TTL.
 */
export function createCache<K, V>(options?: CacheOptions): CacheInstance<K, V> {
  const maxSize = options?.maxSize ?? 100;
  const ttlMs = options?.ttlMs ?? 300_000;
  const map = new Map<K, CacheEntry<V>>();

  const instance: Omit<CacheInstance<K, V>, "size"> = {
    get(key: K): V | undefined {
      const entry = map.get(key);
      if (entry === undefined) return undefined;

      if (Date.now() > entry.expiresAt) {
        map.delete(key);
        return undefined;
      }

      // Refresh LRU order by moving to end
      map.delete(key);
      map.set(key, entry);
      return entry.value;
    },

    set(key: K, value: V): void {
      // Remove existing entry first (to re-insert at end)
      map.delete(key);

      // Evict LRU if at capacity
      if (map.size >= maxSize) {
        const firstKey = map.keys().next().value;
        if (firstKey !== undefined) {
          map.delete(firstKey);
        }
      }

      map.set(key, { value, expiresAt: Date.now() + ttlMs });
    },

    has(key: K): boolean {
      return instance.get(key) !== undefined;
    },

    delete(key: K): boolean {
      return map.delete(key);
    },

    clear(): void {
      map.clear();
    },
  };

  Object.defineProperty(instance, "size", {
    get(): number {
      const now = Date.now();
      let count = 0;
      for (const [key, entry] of map) {
        if (now > entry.expiresAt) {
          map.delete(key);
        } else {
          count++;
        }
      }
      return count;
    },
    enumerable: true,
    configurable: true,
  });

  return instance as CacheInstance<K, V>;
}

// Backward-compatible type alias
export type Cache<K, V> = ReturnType<typeof createCache<K, V>>;
