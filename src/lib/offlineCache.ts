// Offline data cache using localStorage
// Portfolio positions & trades are cached so offline dashboard works

const PREFIX = 'lumen_offline_';

export function cacheSet<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({
      data,
      cachedAt: Date.now(),
    }));
  } catch {
    // localStorage full or unavailable
  }
}

export function cacheGet<T>(key: string): { data: T; cachedAt: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

export function cacheClear(): void {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}

export function getOfflineKeys(): string[] {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => k.slice(PREFIX.length));
}
