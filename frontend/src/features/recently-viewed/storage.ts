import type { RecentlyViewedEntry } from "./types";

const STORAGE_KEY = "lics.recently-viewed";
const MAX_ENTRIES = 10;

function isRecentlyViewedEntry(
  value: unknown,
): value is RecentlyViewedEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Record<string, unknown>;

  return (
    typeof entry.type === "string" &&
    typeof entry.id === "number" &&
    typeof entry.label === "string" &&
    typeof entry.href === "string" &&
    typeof entry.viewedAt === "string"
  );
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function getRecentlyViewed(): RecentlyViewedEntry[] {
  const storage = getStorage();

  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRecentlyViewedEntry);
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(
  entry: RecentlyViewedEntry,
): void {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  try {
    const current = getRecentlyViewed().filter(
      (existing) =>
        !(existing.type === entry.type && existing.id === entry.id),
    );

    const next = [entry, ...current].slice(0, MAX_ENTRIES);

    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage puede fallar en modo privado o con el cupo lleno;
    // no es crítico, la pantalla sigue funcionando sin este registro.
  }
}
