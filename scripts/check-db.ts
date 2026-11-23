// Quick DB‑connection sanity check for Esthy‑POS
import 'dotenv/config';
import { pool } from "../src/db";
import { sql } from "drizzle-orm";

(async () => {
  try {
    const result = await pool.query('SELECT 1');
    console.log("✅ DB connection succeeded:", result);
    process.exit(0);
  } catch (err) {
    console.error("❌ DB connection failed:", err);
    process.exit(1);
  }
})();
