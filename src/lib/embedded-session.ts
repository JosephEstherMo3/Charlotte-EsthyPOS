"use client";

/**
 * Cookie-independent fallback session.
 *
 * The httpOnly cookie is always the primary session. This credential exists only
 * for browsers that refuse cookies inside an embedded preview frame: it is sent
 * to our same-origin /api routes as `Authorization: Bearer …` and lives as long
 * as a normal session (14 days), so a preview reload does not sign you out.
 *
 * Storage order: memory → sessionStorage → localStorage (localStorage only while
 * embedded, where cookies are unavailable and a fresh tab must stay signed in).
 * `clearEmbeddedSession()` removes every copy on sign-out and password changes.
 */
const STORAGE_KEY = "ce_embedded_session_v1";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
type Session = { token: string; expiresAt: string };
let memorySession: Session | null = null;

/** A cross-origin iframe can compare WindowProxy references without reading its parent's contents. */
export function isEmbeddedContext(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function valid(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<Session>;
  return (
    typeof s.token === "string" &&
    TOKEN_RE.test(s.token) &&
    typeof s.expiresAt === "string" &&
    Number.isFinite(Date.parse(s.expiresAt)) &&
    Date.parse(s.expiresAt) > Date.now()
  );
}

function read(storage: Storage | undefined): Session | null {
  if (!storage) return null;
  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    if (valid(parsed)) return parsed;
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Storage access may be disallowed inside a third-party frame.
  }
  return null;
}

/** Returns false when every storage is blocked; the token still works in memory until reload. */
export function setEmbeddedSession(session: Session): boolean {
  if (!valid(session)) return false;
  memorySession = session;
  let persisted = false;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    persisted = true;
  } catch {
    /* blocked */
  }
  if (isEmbeddedContext()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      persisted = true;
    } catch {
      /* blocked */
    }
  }
  return persisted;
}

export function getEmbeddedToken(): string | null {
  if (valid(memorySession)) return memorySession.token;
  memorySession = null;
  const found = read(window?.sessionStorage) ?? (isEmbeddedContext() ? read(window?.localStorage) : null);
  if (found) {
    memorySession = found;
    return found.token;
  }
  return null;
}

export function clearEmbeddedSession(): void {
  memorySession = null;
  for (const storage of [window?.sessionStorage, window?.localStorage]) {
    try {
      storage?.removeItem(STORAGE_KEY);
    } catch {
      /* the in-memory copy is already gone */
    }
  }
}
