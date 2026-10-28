import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const rawUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const url = rawUrl.replace(/[?&]sslmode=[^&]+/, "");
const isRemote =
  url.includes("supabase.co") ||
  url.includes("supabase.com") ||
  url.includes("pooler.supabase.com") ||
  url.includes("neon.tech");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  },
});
