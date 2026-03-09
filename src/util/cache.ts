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

/**
 * Generic TTL + LRU cache.
 * - Entries expire after `ttlMs` milliseconds.
 * - When `maxSize` is reached, the least-recently-used entry is evicted.
 * - `get()` refreshes LRU order but does NOT extend TTL.
 */
export class Cache<K, V> {
  private readonly map: Map<K, CacheEntry<V>>;
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(options?: CacheOptions) {
    this.maxSize = options?.maxSize ?? 100;
    this.ttlMs = options?.ttlMs ?? 300_000;
    this.map = new Map();
  }

  /** Get a cached value. Returns undefined if expired or missing. */
  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Refresh LRU order by moving to end
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  /** Set a value in the cache. */
  set(key: K, value: V): void {
    // Remove existing entry first (to re-insert at end)
    this.map.delete(key);

    // Evict LRU if at capacity
    if (this.map.size >= this.maxSize) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }

    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Check if a non-expired entry exists. */
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /** Delete a specific entry. */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /** Clear all entries. */
  clear(): void {
    this.map.clear();
  }

  /** Current number of non-expired entries. */
  get size(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.map) {
      if (now > entry.expiresAt) {
        this.map.delete(key);
      } else {
        count++;
      }
    }
    return count;
  }
}
