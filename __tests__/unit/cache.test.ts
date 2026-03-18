import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCache } from "../../src/util/cache.ts";

describe("Cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("basic get/set", () => {
    const cache = createCache<string, number>();
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("returns undefined for missing key", () => {
    const cache = createCache<string, number>();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("entry expires after TTL", () => {
    const cache = createCache<string, number>({ ttlMs: 1000 });
    cache.set("a", 1);
    vi.advanceTimersByTime(1001);
    expect(cache.get("a")).toBeUndefined();
  });

  it("entry is accessible before TTL expires", () => {
    const cache = createCache<string, number>({ ttlMs: 1000 });
    cache.set("a", 1);
    vi.advanceTimersByTime(999);
    expect(cache.get("a")).toBe(1);
  });

  it("LRU eviction: oldest entry evicted when at max capacity", () => {
    const cache = createCache<string, number>({ maxSize: 3 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // should evict "a"
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("get() refreshes LRU order — accessed entries survive eviction", () => {
    const cache = createCache<string, number>({ maxSize: 3 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    // Access "a" to make it most recently used
    cache.get("a");
    // Insert "d" — should evict "b" (now LRU), not "a"
    cache.set("d", 4);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("has() returns false for expired entries", () => {
    const cache = createCache<string, number>({ ttlMs: 500 });
    cache.set("a", 1);
    vi.advanceTimersByTime(501);
    expect(cache.has("a")).toBe(false);
  });

  it("has() returns true for live entries", () => {
    const cache = createCache<string, number>();
    cache.set("a", 1);
    expect(cache.has("a")).toBe(true);
  });

  it("delete() removes an entry", () => {
    const cache = createCache<string, number>();
    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
  });

  it("delete() returns false for missing key", () => {
    const cache = createCache<string, number>();
    expect(cache.delete("missing")).toBe(false);
  });

  it("clear() empties the cache", () => {
    const cache = createCache<string, number>();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("size reflects non-expired entries only", () => {
    const cache = createCache<string, number>({ ttlMs: 500 });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);
    vi.advanceTimersByTime(600);
    expect(cache.size).toBe(0);
  });

  it("overwriting a key updates its value", () => {
    const cache = createCache<string, number>();
    cache.set("a", 1);
    cache.set("a", 42);
    expect(cache.get("a")).toBe(42);
    expect(cache.size).toBe(1);
  });
});
