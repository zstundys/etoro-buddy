import { describe, it, expect, beforeEach, vi } from "vitest";

function freshModule() {
  vi.resetModules();
  return import("./api-cache");
}

function mockLocalStorage() {
  const store = new Map<string, string>();
  const mock: Storage = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear()),
    get length() {
      return store.size;
    },
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    writable: true,
    configurable: true,
  });
  return { store, mock };
}

describe("api-cache", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  describe("createCache with static key", () => {
    it("returns null when cache is empty", async () => {
      const { createCache } = await freshModule();
      const cache = createCache<string>({
        key: "test-key",
        serialize: (d) => d,
        deserialize: (r) => r,
      });
      expect(cache.get()).toBeNull();
    });

    it("stores and retrieves data", async () => {
      const { createCache } = await freshModule();
      const cache = createCache<string>({
        key: "test-key",
        serialize: (d) => d,
        deserialize: (r) => r,
      });
      cache.set("hello");
      expect(cache.get()).toBe("hello");
    });

    it("clears data", async () => {
      const { createCache } = await freshModule();
      const cache = createCache<string>({
        key: "test-key",
        serialize: (d) => d,
        deserialize: (r) => r,
      });
      cache.set("hello");
      cache.clear();
      expect(cache.get()).toBeNull();
    });

    it("uses JSON.stringify/JSON.parse as default serialize/deserialize", async () => {
      const { createCache } = await freshModule();
      const cache = createCache<{ name: string; count: number }>({
        key: "default-serde",
      });
      cache.set({ name: "test", count: 42 });
      expect(cache.get()).toEqual({ name: "test", count: 42 });
    });

    it("default deserialize returns null for invalid JSON", async () => {
      const { createCache } = await freshModule();
      const cache = createCache<string>({ key: "bad-json" });
      localStorage.setItem("bad-json", "{invalid");
      expect(cache.get()).toBeNull();
    });

    it("handles complex types with serialize/deserialize", async () => {
      const { createCache } = await freshModule();
      const cache = createCache<Map<number, string>>({
        key: "map-cache",
        serialize: (m) => JSON.stringify([...m.entries()]),
        deserialize: (raw) =>
          new Map(
            (JSON.parse(raw) as [number, string][]).map(([k, v]) => [
              Number(k),
              v,
            ]),
          ),
      });
      const data = new Map([
        [1, "apple"],
        [2, "banana"],
      ]);
      cache.set(data);
      const result = cache.get()!;
      expect(result).toBeInstanceOf(Map);
      expect(result.get(1)).toBe("apple");
      expect(result.get(2)).toBe("banana");
    });
  });

  describe("createCache with keyPrefix + keyFn", () => {
    it("stores different data for different params", async () => {
      const { createCache } = await freshModule();
      const cache = createCache<string[], number[]>({
        keyPrefix: "items",
        keyFn: (ids) => [...ids].sort((a, b) => a - b).join(","),
        serialize: JSON.stringify,
        deserialize: (raw) => JSON.parse(raw),
      });
      cache.set(["a", "b"], [1, 2]);
      cache.set(["c", "d"], [3, 4]);
      expect(cache.get([1, 2])).toEqual(["a", "b"]);
      expect(cache.get([3, 4])).toEqual(["c", "d"]);
      expect(cache.get([2, 1])).toEqual(["a", "b"]);
    });

    it("clear() removes all keys with the prefix", async () => {
      const { createCache } = await freshModule();
      const cache = createCache<string, string>({
        keyPrefix: "pfx",
        keyFn: (id) => id,
        serialize: (d) => d,
        deserialize: (r) => r,
      });
      cache.set("val1", "a");
      cache.set("val2", "b");
      expect(cache.get("a")).toBe("val1");
      cache.clear();
      expect(cache.get("a")).toBeNull();
      expect(cache.get("b")).toBeNull();
    });
  });

  describe("invalidateAll", () => {
    it("clears all registered caches", async () => {
      const { createCache, invalidateAll } = await freshModule();
      const cache1 = createCache<string>({
        key: "k1",
        serialize: (d) => d,
        deserialize: (r) => r,
      });
      const cache2 = createCache<string>({
        key: "k2",
        serialize: (d) => d,
        deserialize: (r) => r,
      });
      cache1.set("one");
      cache2.set("two");
      invalidateAll();
      expect(cache1.get()).toBeNull();
      expect(cache2.get()).toBeNull();
    });

    it("does not clear non-registered localStorage keys", async () => {
      const { createCache, invalidateAll } = await freshModule();
      localStorage.setItem("unrelated-key", "keep-me");
      createCache<string>({
        key: "registered",
        serialize: (d) => d,
        deserialize: (r) => r,
      }).set("data");
      invalidateAll();
      expect(localStorage.getItem("unrelated-key")).toBe("keep-me");
    });
  });

  describe("SSR safety (no localStorage)", () => {
    it("returns null when localStorage is unavailable", async () => {
      Object.defineProperty(globalThis, "localStorage", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const { createCache } = await freshModule();
      const cache = createCache<string>({
        key: "ssr-key",
        serialize: (d) => d,
        deserialize: (r) => r,
      });
      cache.set("data");
      expect(cache.get()).toBeNull();
    });
  });

  describe("quota exceeded handling", () => {
    it("does not throw when setItem throws", async () => {
      const { store } = mockLocalStorage();
      const origSet = localStorage.setItem;
      (localStorage as Storage).setItem = vi.fn(() => {
        throw new DOMException("QuotaExceededError");
      });
      const { createCache } = await freshModule();
      const cache = createCache<string>({
        key: "quota-key",
        serialize: (d) => d,
        deserialize: (r) => r,
      });
      expect(() => cache.set("data")).not.toThrow();
      expect(cache.get()).toBeNull();
      (localStorage as Storage).setItem = origSet;
    });
  });

  describe("deserialize error handling", () => {
    it("returns null when deserialize throws", async () => {
      const { createCache } = await freshModule();
      const cache = createCache<string>({
        key: "bad-data",
        serialize: (d) => d,
        deserialize: () => {
          throw new Error("corrupt");
        },
      });
      localStorage.setItem("bad-data", "garbage");
      expect(cache.get()).toBeNull();
    });
  });
});
