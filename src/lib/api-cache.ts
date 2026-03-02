const registry: Array<() => void> = [];

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function safeGet(key: string): string | null {
  if (!hasStorage()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota exceeded */
  }
}

function safeRemove(key: string): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function removeByPrefix(prefix: string): void {
  if (!hasStorage()) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

type StaticCacheConfig<T> = {
  key: string;
  keyPrefix?: undefined;
  keyFn?: undefined;
  serialize?: (data: T) => string;
  deserialize?: (raw: string) => T | null;
};

type ParamCacheConfig<T, P> = {
  key?: undefined;
  keyPrefix: string;
  keyFn: (params: P) => string;
  serialize?: (data: T) => string;
  deserialize?: (raw: string) => T | null;
};

type CacheConfig<T, P> = StaticCacheConfig<T> | ParamCacheConfig<T, P>;

export type Cache<T, P = void> = {
  get: P extends void ? () => T | null : (params: P) => T | null;
  set: P extends void ? (data: T) => void : (data: T, params: P) => void;
  clear: () => void;
};

const defaultSerialize = <T>(data: T): string => JSON.stringify(data);
const defaultDeserialize = <T>(raw: string): T | null => JSON.parse(raw) as T;

export function createCache<T, P = void>(
  config: CacheConfig<T, P>,
): Cache<T, P> {
  const serialize = config.serialize ?? defaultSerialize;
  const deserialize = config.deserialize ?? defaultDeserialize;

  function resolveKey(params?: P): string | null {
    if (config.key != null) return config.key;
    if (config.keyPrefix != null && config.keyFn != null && params !== undefined) {
      return `${config.keyPrefix}-${config.keyFn(params)}`;
    }
    return null;
  }

  function get(params?: P): T | null {
    const key = resolveKey(params);
    if (!key) return null;
    const raw = safeGet(key);
    if (raw === null) return null;
    try {
      return deserialize(raw);
    } catch {
      return null;
    }
  }

  function set(data: T, params?: P): void {
    const key = resolveKey(params);
    if (!key) return;
    try {
      safeSet(key, serialize(data));
    } catch {
      /* ignore serialization errors */
    }
  }

  function clear(): void {
    if (config.key != null) {
      safeRemove(config.key);
    }
    if (config.keyPrefix != null) {
      removeByPrefix(`${config.keyPrefix}-`);
    }
  }

  registry.push(clear);

  return {
    get: get as Cache<T, P>["get"],
    set: set as Cache<T, P>["set"],
    clear,
  };
}

export function invalidateAll(): void {
  for (const clear of registry) clear();
}
