import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { businesses, businessSettings, embeddedSessions, memberships, passwordResets, users } from "@/db/schema";
import { createEmailVerification } from "@/lib/auth";
import { hashPassword, hashToken } from "@/lib/password";
import { eq } from "drizzle-orm";

/**
 * HTTP-level authentication / authorization / isolation tests.
 * They run against a live server: E2E_BASE_URL=http://localhost:3000 npm test
 * (skipped automatically when E2E_BASE_URL is not set).
 */
const BASE = process.env.E2E_BASE_URL;
const tag = `e2e${Date.now()}`;

class Client {
  cookie = "";
  async req(path: string, opts: { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (this.cookie) headers.cookie = this.cookie;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.raw !== undefined ? "POST" : "GET"),
      headers,
      body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      redirect: "manual",
    });
    const set = res.headers.getSetCookie?.() ?? [];
    const sess = set.find((c) => c.startsWith("ce_session="));
    if (sess) this.cookie = sess.split(";")[0];
    let json: any = null;
    try {
      json = await res.clone().json();
    } catch {
      /* not json */
    }
    return { status: res.status, json, res };
  }
}

describe.skipIf(!BASE)("API authentication, authorization and isolation", () => {
  const A = new Client();
  const B = new Client();
  const cashier = new Client();
  const anon = new Client();
  let productId = "";
  let saleId = "";
  const password = "Sup3r-Secret-pass";

  beforeAll(async () => {
    const ra = await A.req("/api/auth/register", { body: { fullName: "Owner A", businessName: `${tag} Shop A`, email: `${tag}-a@test.local`, password } });
    expect(ra.status).toBe(200);
    // Registration does not sign anyone in: sign in with the same credentials.
    const la = await A.req("/api/auth/login", { body: { email: `${tag}-a@test.local`, password } });
    expect(la.status).toBe(200);
    const rb = await B.req("/api/auth/register", { body: { fullName: "Owner B", businessName: `${tag} Shop B`, email: `${tag}-b@test.local`, password } });
    expect(rb.status).toBe(200);
    const lb = await B.req("/api/auth/login", { body: { email: `${tag}-b@test.local`, password } });
    expect(lb.status).toBe(200);
  });

  afterAll(async () => {
    await db.delete(businesses).where(like(businesses.name, `${tag}%`));
    await db.delete(users).where(like(users.email, `${tag}%`));
    await pool.end();
  });

  it("blocks unauthenticated API access", async () => {
    for (const p of ["/api/products", "/api/sales", "/api/dashboard", "/api/reports", "/api/team", "/api/settings", "/api/customers", "/api/export?type=sales"]) {
      expect((await anon.req(p)).status, p).toBe(401);
    }
    expect((await anon.req("/api/sales", { body: {} })).status).toBe(401);
  });

  it("explains unavailable reset email without generating an unsent token or exposing account existence", async () => {
    const config = await anon.req("/api/auth/config");
    expect(config.status).toBe(200);
    expect(typeof config.json.resetEmailConfigured).toBe("boolean");
    expect(Object.keys(config.json).sort()).toEqual(["resetEmailConfigured"]); // no passwordless mode exists
    expect(config.res.headers.get("cache-control")).toContain("no-store");
    // If an operator configured real Resend delivery, do not send test emails.
    if (config.json.resetEmailConfigured) return;
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, `${tag}-a@test.local`));
    const before = await db.select({ id: passwordResets.id }).from(passwordResets).where(eq(passwordResets.userId, u.id));
    const known = await anon.req("/api/auth/forgot", { body: { email: `${tag}-a@test.local` } });
    const unknown = await anon.req("/api/auth/forgot", { body: { email: `${tag}-missing@test.local` } });
    expect(known.status).toBe(503);
    expect(unknown.status).toBe(503);
    expect(known.json.error).toBe(unknown.json.error);
    expect(known.json.error).toMatch(/not configured/i);
    expect(JSON.stringify(known.json)).not.toMatch(/reset-password\?token=/);
    const after = await db.select({ id: passwordResets.id }).from(passwordResets).where(eq(passwordResets.userId, u.id));
    expect(after).toEqual(before);
  });

  it("creates an account without signing in, then signs in with the same credentials", async () => {
    const fresh = new Client();
    expect((await fresh.req("/api/auth/session")).json).toEqual({ authenticated: false });
    const email = `${tag}-fresh@test.local`;
    const reg = await fresh.req("/api/auth/register", {
      body: { fullName: "Fresh User", businessName: `${tag} Fresh`, email, password },
    });
    expect(reg.status).toBe(200);
    expect(reg.json.verificationRequired).toBe(false); // no mail provider: address starts verified
    expect(fresh.cookie).toBe(""); // registration must never sign anyone in
    expect((await fresh.req("/api/auth/session")).json).toEqual({ authenticated: false });

    // Sign in with exactly the credentials used to register.
    const signed = new Client();
    const login = await signed.req("/api/auth/login", { body: { email, password } });
    expect(login.status).toBe(200);
    expect(login.res.headers.get("cache-control")).toContain("no-store");
    expect(login.json.session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await signed.req("/api/auth/session")).json).toEqual({ authenticated: true });
    expect((await signed.req("/api/products")).status).toBe(200);
    // email matching is case-insensitive
    expect((await new Client().req("/api/auth/login", { body: { email: email.toUpperCase(), password } })).status).toBe(200);
  });

  it("blocks sign-in until the email address is verified", async () => {
    const email = `${tag}-unverified@test.local`;
    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(users).values({ email, fullName: "Unverified User", passwordHash, emailVerifiedAt: null }).returning();
    const [biz] = await db.insert(businesses).values({ name: `${tag} Unverified` }).returning();
    await db.insert(businessSettings).values({ businessId: biz.id, receiptBusinessName: "Unverified" });
    await db.insert(memberships).values({ businessId: biz.id, userId: user.id, role: "owner" });

    const client = new Client();
    const blocked = await client.req("/api/auth/login", { body: { email, password } });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error).toMatch(/verify your email/i);
    expect(client.cookie).toBe("");

    const token = await createEmailVerification(user.id);
    expect((await client.req("/api/auth/verify", { body: { token } })).status).toBe(200);
    expect((await new Client().req("/api/auth/verify", { body: { token } })).status).toBe(400); // single-use
    expect((await client.req("/api/auth/login", { body: { email, password } })).status).toBe(200);
  });

  it("returns a cookie-independent session so a restricted tab is never stranded", async () => {
    const email = `${tag}-restricted@test.local`;
    const owner = new Client();
    await owner.req("/api/auth/register", { body: { fullName: "Restricted User", businessName: `${tag} Restricted`, email, password } });
    const login = await owner.req("/api/auth/login", { body: { email, password } });
    expect(login.status).toBe(200);
    const credential = login.json.session.token as string;

    // The tab discards Set-Cookie: only the returned credential is left.
    const cookieless = new Client();
    const bearer = { Authorization: `Bearer ${credential}` };
    expect((await cookieless.req("/api/auth/session", { headers: bearer })).json).toEqual({ authenticated: true });
    expect((await cookieless.req("/api/auth/context", { headers: bearer })).status).toBe(200);
    expect((await cookieless.req("/api/products", { headers: bearer })).status).toBe(200);
    // A malformed or unknown bearer never falls back to a cookie.
    expect((await owner.req("/api/products", { headers: { Authorization: "Bearer invalid" } })).status).toBe(401);
    expect((await cookieless.req("/api/products", { headers: { Authorization: `Bearer ${"z".repeat(43)}` } })).status).toBe(401);
  });

  it("does not create a session when the password is wrong", async () => {
    const bad = new Client();
    expect((await bad.req("/api/auth/login", { body: { email: `${tag}-a@test.local`, password: "wrong-password" } })).status).toBe(401);
    expect(bad.cookie).toBe("");
    expect((await bad.req("/api/auth/session")).json).toEqual({ authenticated: false });
    expect((await bad.req("/api/auth/login", { body: { email: `${tag}-a@test.local`, password } })).status).toBe(200);
    expect((await bad.req("/api/auth/session")).json).toEqual({ authenticated: true });
  });

  it("revokes fallback sessions when the password changes", async () => {
    const account = new Client();
    const email = `${tag}-password@test.local`;
    await account.req("/api/auth/register", { body: { fullName: "Password Test", businessName: `${tag} Password Test`, email, password } });
    const login = await account.req("/api/auth/login", { body: { email, password } });
    const credential = login.json.session.token as string;
    const holder = new Client();
    expect((await holder.req("/api/auth/context", { headers: { Authorization: `Bearer ${credential}` } })).status).toBe(200);
    expect((await account.req("/api/me", { method: "PATCH", body: { currentPassword: password, newPassword: "NewPass123!Stronger" } })).status).toBe(200);
    expect((await holder.req("/api/auth/context", { headers: { Authorization: `Bearer ${credential}` } })).status).toBe(401);
    expect((await new Client().req("/api/auth/login", { body: { email, password: "NewPass123!Stronger" } })).status).toBe(200);
  });

  it("issues a cross-context cookie (SameSite=None; Secure; Partitioned) over https and Lax over http", async () => {
    const email = `${tag}-a@test.local`;
    const https = await new Client().req("/api/auth/login", { body: { email, password }, headers: { "x-forwarded-proto": "https" } });
    const httpsCookie = (https.res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("ce_session=")) ?? "";
    expect(httpsCookie).toMatch(/HttpOnly/i);
    expect(httpsCookie).toMatch(/Secure/i);
    expect(httpsCookie).toMatch(/SameSite=none/i);
    expect(httpsCookie).toMatch(/Partitioned/i);

    const viaOrigin = await new Client().req("/api/auth/login", { body: { email, password }, headers: { origin: "https://example-preview.app" } });
    // an https Origin from another host is still rejected as cross-site (see next test), so this must be refused
    expect(viaOrigin.status).toBe(403);

    const http = await new Client().req("/api/auth/login", { body: { email, password } });
    const httpCookie = (http.res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("ce_session=")) ?? "";
    expect(httpCookie).toMatch(/SameSite=lax/i);
    expect(httpCookie).not.toMatch(/Secure/i);
  });

  it("rejects cross-site state-changing requests but allows same-origin ones", async () => {
    const email = `${tag}-a@test.local`;
    const cross = await new Client().req("/api/auth/login", { body: { email, password }, headers: { "sec-fetch-site": "cross-site" } });
    expect(cross.status).toBe(403);
    expect(cross.json.error).toMatch(/cross-site/i);
    const evilOrigin = await A.req("/api/products", { body: { name: "CSRF", price: 1 }, headers: { origin: "https://evil.example" } });
    expect(evilOrigin.status).toBe(403);
    const same = await new Client().req("/api/auth/login", { body: { email, password }, headers: { "sec-fetch-site": "same-origin" } });
    expect(same.status).toBe(200);
    const sameOrigin = await new Client().req("/api/auth/login", { body: { email, password }, headers: { origin: new URL(BASE!).origin } });
    expect(sameOrigin.status).toBe(200);
    // reads are never blocked by this check
    expect((await new Client().req("/api/auth/session", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(200);
  });

  it("sends no private data to signed-out page requests and removes the old handoff page", async () => {
    const response = await anon.req("/dashboard");
    expect(response.status).toBe(200);
    const html = await response.res.text();
    expect(html).toContain("Restoring your secure session");
    expect(html).not.toContain(`${tag} Shop A`);
    expect(html).not.toContain(`${tag} Shop B`);
    expect((await anon.req("/api/dashboard")).status).toBe(401);
    // The one-time sign-in / new-tab handoff is gone entirely.
    expect((await anon.req("/auth/handoff")).status).toBe(404);
    expect((await anon.req("/api/auth/handoff", { body: { token: "z".repeat(43) } })).status).toBe(404);
    expect((await anon.req("/api/auth/embed", { body: { token: "z".repeat(43) } })).status).toBe(404);
  });

  it("rejects wrong passwords with a generic message", async () => {
    const r = await anon.req("/api/auth/login", { body: { email: `${tag}-a@test.local`, password: "wrong-password" } });
    expect(r.status).toBe(401);
    expect(r.json.error).toBe("Incorrect email or password.");
    const unknown = await anon.req("/api/auth/login", { body: { email: `${tag}-nobody@test.local`, password: "wrong-password" } });
    expect(unknown.json.error).toBe(r.json.error); // does not reveal whether the account exists
  });

  it("validates registration input", async () => {
    expect((await anon.req("/api/auth/register", { body: { fullName: "X", businessName: "Y", email: "nope", password: "short" } })).status).toBe(400);
    expect((await anon.req("/api/auth/register", { body: { fullName: "Dup", businessName: `${tag} Dup`, email: `${tag}-a@test.local`, password } })).status).toBe(409);
  });

  it("lets an owner create products and see them", async () => {
    const c = await A.req("/api/products", { body: { name: "Widget", sku: "W-1", price: 10, costPrice: 4, stockQty: 5 } });
    expect(c.status).toBe(201);
    productId = c.json.id;
    const l = await A.req("/api/products");
    expect(l.json.products.map((p: { id: string }) => p.id)).toContain(productId);
  });

  it("requires a real sign-in on every host, including platform preview domains", async () => {
    // Developer mode is removed: no hostname auto-opens a workspace.
    for (const host of [undefined, "3000-developer-tests.e2b.app", "01a1230a-fa28-78a1-8806-4685a1a2cc96.arena.site", "pos.example.com"]) {
      const headers: Record<string, string> = host ? { "x-forwarded-host": host } : {};
      const visitor = new Client();
      expect((await visitor.req("/api/products", { headers })).status, String(host)).toBe(401);
      expect((await visitor.req("/api/team", { headers })).status, String(host)).toBe(401);
      expect((await visitor.req("/api/dashboard", { headers })).status, String(host)).toBe(401);
      const page = await visitor.req("/login", { headers });
      expect(page.status, String(host)).toBe(200);
      const html = await page.res.text();
      expect(html, String(host)).toContain("Welcome back");
      expect(html, String(host)).not.toContain("Developer preview");
      expect(html, String(host)).not.toContain("Sandbox business");
    }

    // Registered credentials still work on those hosts.
    const signed = new Client();
    const login = await signed.req("/api/auth/login", {
      body: { email: `${tag}-a@test.local`, password },
      headers: { "x-forwarded-host": "3000-developer-tests.e2b.app" },
    });
    expect(login.status).toBe(200);
    expect((await signed.req("/api/products")).status).toBe(200);
    const dash = await signed.req("/dashboard", { headers: { "x-forwarded-host": "3000-developer-tests.e2b.app" } });
    expect(dash.status).toBe(200);
    const dashHtml = await dash.res.text();
    expect(dashHtml).toContain(`${tag} Shop A`);
    expect(dashHtml).not.toContain("Developer preview");
    expect(dashHtml).not.toContain("return to developer preview");
  });


  it("keeps the POS usable when the browser cannot keep cookies", async () => {
    const email = `${tag}-nocookie@test.local`;
    const owner = new Client();
    await owner.req("/api/auth/register", { body: { fullName: "No Cookie", businessName: `${tag} No Cookie`, email, password } });
    const login = await owner.req("/api/auth/login", { body: { email, password } });
    const bearer = { Authorization: `Bearer ${login.json.session.token}` };

    const created = await owner.req("/api/products", { headers: bearer, body: { name: "Preview Product", price: 12, stockQty: 5 } });
    expect(created.status).toBe(201);
    expect((await owner.req("/api/products", { headers: bearer })).json.products.map((p: { id: string }) => p.id)).toContain(created.json.id);
    expect((await owner.req(`/api/products/${productId}`, { method: "PATCH", body: { name: "Cross business" }, headers: bearer })).status).toBe(404);
    const csv = await owner.req("/api/export?type=inventory", { headers: bearer });
    expect(csv.status).toBe(200);
    expect(await csv.res.text()).toContain("Preview Product");
  });

  it("isolates data between businesses", async () => {
    const l = await B.req("/api/products");
    expect(l.status).toBe(200);
    expect(l.json.products).toHaveLength(0);
    expect((await B.req(`/api/products/${productId}`, { method: "PATCH", body: { name: "Hacked" } })).status).toBe(404);
    expect((await B.req("/api/inventory", { body: { productId, type: "restock", quantityChange: 5, reason: "attack" } })).status).toBe(404);
    const sell = await B.req("/api/sales", { body: { items: [{ productId, quantity: 1 }], paymentMethod: "card", idempotencyKey: `${tag}-cross-business-0001` } });
    expect(sell.status).toBe(422);
  });

  it("enforces roles on the server", async () => {
    const add = await A.req("/api/team", { body: { fullName: "Cashier One", email: `${tag}-c@test.local`, password, role: "cashier" } });
    expect(add.status).toBe(201);
    expect((await cashier.req("/api/auth/login", { body: { email: `${tag}-c@test.local`, password } })).status).toBe(200);

    for (const [method, path, body] of [
      ["GET", "/api/reports", undefined],
      ["GET", "/api/team", undefined],
      ["GET", "/api/settings", undefined],
      ["GET", "/api/audit", undefined],
      ["GET", "/api/export?type=sales", undefined],
      ["GET", "/api/inventory", undefined],
      ["POST", "/api/products", { name: "Nope", price: 1 }],
      ["PATCH", `/api/products/${productId}`, { price: 0 }],
      ["POST", "/api/team", { fullName: "Evil", email: `${tag}-evil@test.local`, password, role: "owner" }],
      ["POST", "/api/customers", { name: "Unauthorized customer" }],
      ["PATCH", `/api/customers/${productId}`, { name: "Not allowed" }],
      ["DELETE", `/api/customers/${productId}`, undefined],
      ["PATCH", "/api/settings", { taxRate: 50 }],
    ] as const) {
      const r = await cashier.req(path, { method, body });
      expect(r.status, `${method} ${path}`).toBe(403);
    }
    const prods = await cashier.req("/api/products");
    expect(prods.status).toBe(200);
    expect(prods.json.products[0].costPrice).toBeNull(); // cost prices are hidden from cashiers
  });

  it("lets managers work on sales but reserves users and customer records for owners", async () => {
    const added = await A.req("/api/team", {
      body: { fullName: "Shop Manager", email: `${tag}-manager@test.local`, password, role: "manager" },
    });
    expect(added.status).toBe(201);
    const manager = new Client();
    expect((await manager.req("/api/auth/login", { body: { email: `${tag}-manager@test.local`, password } })).status).toBe(200);
    expect((await manager.req("/api/team")).status).toBe(200);
    expect((await manager.req("/api/customers")).status).toBe(200);
    expect((await manager.req("/api/reports")).status).toBe(200);
    expect((await manager.req("/api/team", {
      body: { fullName: "Not allowed", email: `${tag}-unauthorized@test.local`, password, role: "cashier" },
    })).status).toBe(403);
    expect((await manager.req("/api/team/" + added.json.id, { method: "PATCH", body: { status: "disabled" } })).status).toBe(403);
    expect((await manager.req("/api/customers", { body: { name: "Not allowed" } })).status).toBe(403);
    expect((await manager.req(`/api/customers/${productId}`, { method: "PATCH", body: { name: "Not allowed" } })).status).toBe(403);
    expect((await manager.req(`/api/customers/${productId}`, { method: "DELETE" })).status).toBe(403);
  });

  it("lets a cashier sell; totals come from the server and duplicates are ignored", async () => {
    const key = `${tag}-sale-key-000001`;
    const body = { items: [{ productId, quantity: 2 }], paymentMethod: "cash", amountTendered: 50, discountType: "none", discountValue: 0, idempotencyKey: key, total: 0.01 };
    const r = await cashier.req("/api/sales", { body });
    expect(r.status).toBe(201);
    expect(r.json.sale.total).toBe("20.00"); // client-supplied "total" is ignored
    expect(r.json.sale.changeDue).toBe("30.00");
    saleId = r.json.sale.id;
    const again = await cashier.req("/api/sales", { body });
    expect(again.status).toBe(200);
    expect(again.json.duplicate).toBe(true);
    expect(again.json.sale.id).toBe(saleId);
    const prods = await A.req("/api/products");
    expect(prods.json.products.find((p: { id: string }) => p.id === productId).stockQty).toBe(3);
  });

  it("refuses to oversell via the API", async () => {
    const r = await cashier.req("/api/sales", { body: { items: [{ productId, quantity: 99 }], paymentMethod: "card", idempotencyKey: `${tag}-oversell-00001` } });
    expect(r.status).toBe(409);
  });

  it("validates sale input", async () => {
    const bad = await cashier.req("/api/sales", { body: { items: [{ productId, quantity: -1 }], paymentMethod: "card", idempotencyKey: `${tag}-bad-qty-000001` } });
    expect(bad.status).toBe(400);
    const short = await cashier.req("/api/sales", { body: { items: [{ productId, quantity: 1 }], paymentMethod: "cash", amountTendered: 1, idempotencyKey: `${tag}-short-cash-0001` } });
    expect(short.status).toBe(422);
    const notJson = await cashier.req("/api/sales", { raw: "items=1", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(notJson.status).toBe(415);
  });

  it("restricts sale visibility and refunds", async () => {
    expect((await cashier.req(`/api/sales/${saleId}`)).status).toBe(200); // own sale
    expect((await B.req(`/api/sales/${saleId}`)).status).toBe(404); // other business
    const refund = { kind: "refund", items: [], reason: "test refund", restock: true };
    expect((await cashier.req(`/api/sales/${saleId}/refund`, { body: refund })).status).toBe(403);
    expect((await B.req(`/api/sales/${saleId}/refund`, { body: { kind: "void", reason: "attack", restock: true } })).status).toBe(404);
    const ok = await A.req(`/api/sales/${saleId}/refund`, { body: { kind: "void", reason: "Owner cancelled this", restock: true } });
    expect(ok.status).toBe(200);
    expect(ok.json.sale.status).toBe("voided");
    const prods = await A.req("/api/products");
    expect(prods.json.products.find((p: { id: string }) => p.id === productId).stockQty).toBe(5);
  });

  it("serves CSV exports to authorised users only", async () => {
    const r = await A.req("/api/export?type=sales");
    expect(r.status).toBe(200);
    expect(r.res.headers.get("content-type")).toContain("text/csv");
  });

  it("invalidates the session on logout", async () => {
    const c = new Client();
    await c.req("/api/auth/login", { body: { email: `${tag}-b@test.local`, password } });
    expect((await c.req("/api/products")).status).toBe(200);
    const old = c.cookie;
    await c.req("/api/auth/logout", { body: {} });
    const replay = new Client();
    replay.cookie = old;
    expect((await replay.req("/api/products")).status).toBe(401);
  });
});
