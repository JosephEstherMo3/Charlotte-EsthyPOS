import "dotenv/config";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import { db } from "../src/db";
import { memberships, users, businesses } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const all = await db
    .select({
      mId: memberships.id,
      bizName: businesses.name,
      bizId: businesses.id,
      userName: users.fullName,
      userEmail: users.email,
      role: memberships.role,
      status: memberships.status,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(businesses, eq(businesses.id, memberships.businessId));

  console.log("All memberships:", all);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
