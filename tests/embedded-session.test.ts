import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmbeddedSession, getEmbeddedToken, isEmbeddedContext, setEmbeddedSession } from "@/lib/embedded-session";

const token = "t".repeat(43);
const fresh = () => ({ token, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    },
  });
});

afterEach(() => {
  clearEmbeddedSession();
  vi.unstubAllGlobals();
});

describe("tab-scoped embedded session", () => {
  it("detects iframes without reading the parent page", () => {
    const top = {};
    vi.stubGlobal("window", { self: top, top });
    expect(isEmbeddedContext()).toBe(false);
    vi.stubGlobal("window", { self: {}, top });
    expect(isEmbeddedContext()).toBe(true);
    vi.stubGlobal("window", { self: {}, get top() { throw new Error("Cross-origin access denied"); } });
    expect(isEmbeddedContext()).toBe(true);
  });

  it("persists across a preview reload while embedded, with localStorage as a second copy", () => {
    const localValues = new Map<string, string>();
    vi.stubGlobal("window", {
      self: {},
      top: {},
      sessionStorage: {
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => values.set(k, v),
        removeItem: (k: string) => values.delete(k),
      },
      localStorage: {
        getItem: (k: string) => localValues.get(k) ?? null,
        setItem: (k: string, v: string) => localValues.set(k, v),
        removeItem: (k: string) => localValues.delete(k),
      },
    });
    expect(isEmbeddedContext()).toBe(true);
    expect(setEmbeddedSession(fresh())).toBe(true);
    expect(localValues.size).toBe(1);
    // A reload can present an empty sessionStorage; the second copy keeps the session.
    values.clear();
    expect(getEmbeddedToken()).toBe(token);
    clearEmbeddedSession();
    expect(localValues.size).toBe(0);
    expect(getEmbeddedToken()).toBeNull();
  });

  it("stores an opaque credential in sessionStorage without localStorage outside an embedded frame", () => {
    const local = { setItem: vi.fn() };
    vi.stubGlobal("localStorage", local);
    expect(setEmbeddedSession(fresh())).toBe(true);
    expect(getEmbeddedToken()).toBe(token);
    expect([...values.values()][0]).toContain(token);
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it("keeps the current page working when third-party sessionStorage is blocked", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        setItem: () => { throw new Error("Access denied"); },
        getItem: () => { throw new Error("Access denied"); },
        removeItem: () => { throw new Error("Access denied"); },
      },
    });
    expect(setEmbeddedSession(fresh())).toBe(false);
    expect(getEmbeddedToken()).toBe(token); // in-memory fallback for client-side navigation
    clearEmbeddedSession();
    expect(getEmbeddedToken()).toBeNull();
  });

  it("rejects expired, malformed and missing credentials", () => {
    expect(getEmbeddedToken()).toBeNull();
    expect(setEmbeddedSession({ token, expiresAt: new Date(Date.now() - 1_000).toISOString() })).toBe(false);
    expect(setEmbeddedSession({ token: "not a token", expiresAt: fresh().expiresAt })).toBe(false);
    expect(getEmbeddedToken()).toBeNull();
    values.set("ce_embedded_session_v1", '{"token":"bad","expiresAt":"tomorrow"}');
    expect(getEmbeddedToken()).toBeNull();
    expect(values.size).toBe(0);
  });

  it("erases both the memory copy and the tab-scoped copy on logout", () => {
    setEmbeddedSession(fresh());
    clearEmbeddedSession();
    expect(values.size).toBe(0);
    expect(getEmbeddedToken()).toBeNull();
  });
});
