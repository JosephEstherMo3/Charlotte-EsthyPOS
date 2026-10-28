import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const rawDatabaseUrl = process.env.DATABASE_URL;

if (!rawDatabaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// Strip ?sslmode=... so pg does not force rejectUnauthorized: true on remote poolers
const databaseUrl = rawDatabaseUrl.replace(/[?&]sslmode=[^&]+/, "");

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

const isRemote =
  databaseUrl.includes("supabase.co") ||
  databaseUrl.includes("supabase.com") ||
  databaseUrl.includes("pooler.supabase.com") ||
  databaseUrl.includes("neon.tech") ||
  rawDatabaseUrl.includes("sslmode=require") ||
  process.env.NODE_ENV === "production";

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool, { schema });
