import type { StoredSession } from "./types";

const SESSION_STORAGE_KEY = "lics.auth.session";

function isAuthUser(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const user = value as Record<string, unknown>;

  return (
    typeof user.id === "number" &&
    typeof user.username === "string" &&
    typeof user.first_name === "string" &&
    typeof user.last_name === "string" &&
    typeof user.email === "string" &&
    typeof user.is_active === "boolean" &&
    typeof user.is_staff === "boolean" &&
    typeof user.is_superuser === "boolean" &&
    Array.isArray(user.groups) &&
    user.groups.every((group) => typeof group === "string")
  );
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Record<string, unknown>;

  return (
    typeof session.token === "string" &&
    session.token.length > 0 &&
    isAuthUser(session.user)
  );
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function readStoredSession(): StoredSession | null {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  const rawSession = storage.getItem(SESSION_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession: unknown = JSON.parse(rawSession);

    if (!isStoredSession(parsedSession)) {
      storage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return parsedSession;
  } catch {
    storage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function writeStoredSession(
  session: StoredSession,
): void {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
}

export function clearStoredSession(): void {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(SESSION_STORAGE_KEY);
}