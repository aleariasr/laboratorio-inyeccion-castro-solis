import { readStoredSession } from "@/features/auth/storage";

import type { RecentlyViewedEntry } from "./types";

// La lista es de cada usuario: con una sola clave para todo el navegador,
// quien entraba después veía lo que había abierto el anterior (por ejemplo,
// Ventas veía las compras que abrió el Administrador). Auditoría integral
// del 2026-11-07.
const LEGACY_STORAGE_KEY = "lics.recently-viewed";
const STORAGE_KEY_PREFIX = "lics.recently-viewed.";

function storageKey(): string | null {
  const userId = readStoredSession()?.user.id;

  return userId === undefined ? null : `${STORAGE_KEY_PREFIX}${userId}`;
}
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

  const key = storageKey();

  if (!key) {
    return [];
  }

  try {
    // La lista vieja, compartida entre usuarios, ya no se usa.
    storage.removeItem(LEGACY_STORAGE_KEY);

    const raw = storage.getItem(key);

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

  const key = storageKey();

  if (!storage || !key) {
    return;
  }

  try {
    const current = getRecentlyViewed().filter(
      (existing) =>
        !(existing.type === entry.type && existing.id === entry.id),
    );

    const next = [entry, ...current].slice(0, MAX_ENTRIES);

    storage.setItem(key, JSON.stringify(next));
  } catch {
    // localStorage puede fallar en modo privado o con el cupo lleno;
    // no es crítico, la pantalla sigue funcionando sin este registro.
  }
}
