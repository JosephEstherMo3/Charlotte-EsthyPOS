/**
 * DEMO DATA SEED — for demonstrations only.
 *
 * Creates ONE clearly-labelled demo business ("DEMO — …") with its own users,
 * products, customers and ~14 days of sample sales. It never touches other
 * businesses, so demo transactions are never mixed with real records.
 *
 *   npm run seed:demo            # create (does nothing if demo data already exists)
 *   npm run seed:demo -- --reset # delete the demo business and recreate it
 *
 * Demo logins (password for all: DemoPass123!)
 *   demo.owner@charlotteesthy.test   (owner)
 *   demo.manager@charlotteesthy.test (manager)
 *   demo.cashier@charlotteesthy.test (cashier)
 */
import "dotenv/config";
import { eq, like, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { businesses, businessSettings, categories, customers, memberships, products, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { addDays, todayInTz } from "@/lib/money";
import { createSale, refundSale } from "@/lib/services/sales";

const PASSWORD = "DemoPass123!";
const DOMAIN = "@charlotteesthy.test";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const reset = process.argv.includes("--reset");
  const [existing] = await db.select().from(users).where(eq(users.email, `demo.owner${DOMAIN}`));
  if (existing && !reset) {
    console.log("Demo data already exists. Run with --reset to recreate it.");
    return;
  }
  if (reset) {
    await db.delete(businesses).where(like(businesses.name, "DEMO —%"));
    await db.delete(users).where(like(users.email, `%${DOMAIN}`));
    console.log("Previous demo data removed.");
  }

  const hash = await hashPassword(PASSWORD);
  const verifiedAt = new Date();
  const [owner] = await db.insert(users).values({ email: `demo.owner${DOMAIN}`, passwordHash: hash, fullName: "Demo Owner", emailVerifiedAt: verifiedAt }).returning();
  const [manager] = await db.insert(users).values({ email: `demo.manager${DOMAIN}`, passwordHash: hash, fullName: "Demo Manager", emailVerifiedAt: verifiedAt }).returning();
  const [cashier] = await db.insert(users).values({ email: `demo.cashier${DOMAIN}`, passwordHash: hash, fullName: "Demo Cashier", emailVerifiedAt: verifiedAt }).returning();
  const [biz] = await db.insert(businesses).values({ name: "DEMO — Charlotte Esthy Boutique (sample data)" }).returning();
  await db.insert(businessSettings).values({
    businessId: biz.id,
    receiptBusinessName: "Charlotte Esthy Boutique (DEMO)",
    address: "12 Sample Street, Demo City",
    phone: "+1 555 010 0199",
    email: "demo@charlotteesthy.test",
    currency: "USD",
    timezone: "UTC",
    taxName: "VAT",
    taxRate: "7.50",
    receiptPrefix: "DEMO-",
    receiptFooter: "Thank you for visiting our demo boutique!",
  });
  await db.insert(memberships).values([
    { businessId: biz.id, userId: owner.id, role: "owner" },
    { businessId: biz.id, userId: manager.id, role: "manager" },
    { businessId: biz.id, userId: cashier.id, role: "cashier" },
  ]);

  const cats: Record<string, string> = {};
  for (const name of ["Skincare", "Body", "Hair", "Tools", "Gifts"]) {
    const [c] = await db.insert(categories).values({ businessId: biz.id, name }).returning();
    cats[name] = c.id;
  }
  const catalogue: [string, string, string, number, number, number][] = [
    ["Rose Hydrating Serum", "Skincare", "RHS-01", 24, 9, 120],
    ["Vitamin C Brightening Cream", "Skincare", "VCC-02", 32.5, 12, 90],
    ["Gentle Foaming Cleanser", "Skincare", "GFC-03", 14, 5, 140],
    ["SPF 50 Daily Sunscreen", "Skincare", "SPF-04", 18.5, 7, 110],
    ["Clay Detox Mask", "Skincare", "CDM-05", 16, 6, 80],
    ["Lavender Body Oil", "Body", "LBO-06", 21, 8, 70],
    ["Shea Body Butter", "Body", "SBB-07", 19, 7, 6],
    ["Silk Hair Wrap", "Hair", "SHW-08", 12, 4, 100],
    ["Argan Hair Mask", "Hair", "AHM-09", 22, 8, 4],
    ["Jade Facial Roller", "Tools", "JFR-10", 19, 6, 60],
    ["Gift Set — Deluxe", "Gifts", "GSD-11", 65, 28, 40],
    ["Travel Size Set", "Gifts", "TSS-12", 11, 4, 150],
  ];
  const prods: (typeof products.$inferSelect)[] = [];
  for (const [name, cat, sku, price, cost, stock] of catalogue) {
    const [p] = await db.insert(products).values({ businessId: biz.id, categoryId: cats[cat], name, sku, price: price.toFixed(2), costPrice: cost.toFixed(2), stockQty: stock, lowStockThreshold: 10 }).returning();
    prods.push(p);
  }
  const custs: (typeof customers.$inferSelect)[] = [];
  for (const [name, phone] of [["Amara Okafor", "2348012345678"], ["Linda Mensah", "233201234567"], ["Sofia Reyes", "15550100123"], ["Tunde Bello", "2348098765432"], ["Grace Adeyemi", null]] as const) {
    const [c] = await db.insert(customers).values({ businessId: biz.id, name, phone }).returning();
    custs.push(c);
  }

  const rand = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const today = todayInTz("UTC");
  const sellers = [owner.id, manager.id, cashier.id, cashier.id, cashier.id];
  const saleIds: string[] = [];
  for (let day = 13; day >= 0; day--) {
    const count = 3 + Math.floor(rand() * 6);
    for (let i = 0; i < count; i++) {
      const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({ productId: pick(prods).id, quantity: 1 + Math.floor(rand() * 3) }));
      const method = pick(["cash", "cash", "card", "transfer"] as const);
      const discount = rand() < 0.2;
      let r: Awaited<ReturnType<typeof createSale>>;
      try {
        r = await createSale({
          businessId: biz.id,
          cashierId: pick(sellers),
          items: lines,
          discountType: discount ? "percent" : "none",
          discountValue: discount ? 10 : 0,
          paymentMethod: method,
          amountTendered: method === "cash" ? 5000 : null,
          customerId: rand() < 0.4 ? pick(custs).id : null,
          idempotencyKey: `demo-${day}-${i}-${Math.random().toString(36).slice(2)}`,
        });
      } catch (e) {
        if ((e as { status?: number }).status === 409) continue; // item sold out — skip this sample sale
        throw e;
      }
      const hour = 8 + Math.floor(rand() * 11);
      const minute = Math.floor(rand() * 60);
      const when = `${addDays(today, -day)} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+00`;
      await db.execute(sql`update sales set created_at = ${when}::timestamptz where id = ${r.saleId}`);
      await db.execute(sql`update inventory_movements set created_at = ${when}::timestamptz where sale_id = ${r.saleId}`);
      saleIds.push(r.saleId);
    }
  }
  // a couple of reversals so refund reports have data
  await refundSale({ businessId: biz.id, saleId: saleIds[saleIds.length - 3], userId: manager.id, kind: "void", reason: "Demo: customer changed their mind", restock: true });
  const [firstItem] = await db.execute(sql`select id from sale_items where sale_id = ${saleIds[saleIds.length - 6]} limit 1`).then((r) => r.rows as { id: string }[]);
  await refundSale({ businessId: biz.id, saleId: saleIds[saleIds.length - 6], userId: manager.id, kind: "refund", items: [{ saleItemId: firstItem.id, quantity: 1 }], reason: "Demo: damaged item returned", restock: false });

  console.log(`Demo business created with ${saleIds.length} sample sales.`);
  console.log(`Sign in as demo.owner${DOMAIN} / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
