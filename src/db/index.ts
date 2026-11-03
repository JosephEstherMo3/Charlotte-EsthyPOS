import dns from "node:dns";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

// Ensure resilient DNS resolution when local Wi-Fi router DNS intermittently drops external cloud poolers
const fallbackResolver = new dns.Resolver();
try {
  fallbackResolver.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {}

const originalLookup = dns.lookup.bind(dns);
// @ts-ignore
dns.lookup = function (hostname: string, options: any, callback: any) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  return originalLookup(hostname, options, (err: any, address: any, family: any) => {
    if (err && (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN")) {
      fallbackResolver.resolve4(hostname, (fallbackErr, addresses) => {
        if (!fallbackErr && addresses && addresses.length > 0) {
          if (options && options.all) {
            return callback(
              null,
              addresses.map((addr) => ({ address: addr, family: 4 }))
            );
          }
          return callback(null, addresses[0], 4);
        }
        return callback(err, address, family);
      });
      return;
    }
    return callback(err, address, family);
  });
};

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
