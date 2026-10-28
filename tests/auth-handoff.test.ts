import { describe, expect, it } from "vitest";
import { hashToken, newToken } from "@/lib/password";

describe("one-time sign-in handoff tokens", () => {
  it("creates opaque high-entropy tokens suitable for a short-lived transfer", () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(a).not.toBe(b);
    expect(hashToken(a)).not.toBe(a);
  });
  it("never stores the plaintext handoff token", () => {
    const token = newToken();
    const stored = hashToken(token);
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toContain(token);
  });
});
