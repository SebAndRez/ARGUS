export interface CachedSourceEntry<T> {
  data: T;
  fetchedAt: string;
  expiresAt: string;
}

export interface SourceCacheMetadata {
  available: boolean;
  fetchedAt: string | null;
  expiresAt: string | null;
}

interface StoredSourceEntry<T> extends CachedSourceEntry<T> {
  expiresAtMs: number;
}

const globalCache = globalThis as typeof globalThis & {
  __argusSourceCache?: Map<string, StoredSourceEntry<unknown>>;
};

const sourceCache =
  globalCache.__argusSourceCache ??
  (globalCache.__argusSourceCache = new Map<string, StoredSourceEntry<unknown>>());

export function getCachedSource<T>(key: string): CachedSourceEntry<T> | null {
  const entry = sourceCache.get(key) as StoredSourceEntry<T> | undefined;
  if (!entry || entry.expiresAtMs <= Date.now()) return null;

  return {
    data: entry.data,
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
  };
}

export function setCachedSource<T>(
  key: string,
  data: T,
  ttlMs: number
): CachedSourceEntry<T> {
  const fetchedAtMs = Date.now();
  const expiresAtMs = fetchedAtMs + Math.max(0, ttlMs);
  const entry: StoredSourceEntry<T> = {
    data,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
  };

  sourceCache.set(key, entry as StoredSourceEntry<unknown>);

  return {
    data: entry.data,
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
  };
}

export function clearCachedSource(key: string) {
  sourceCache.delete(key);
}

export function getSourceCacheMetadata(key: string): SourceCacheMetadata {
  const entry = sourceCache.get(key);
  if (!entry) {
    return {
      available: false,
      fetchedAt: null,
      expiresAt: null,
    };
  }

  return {
    available: entry.expiresAtMs > Date.now(),
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
  };
}
