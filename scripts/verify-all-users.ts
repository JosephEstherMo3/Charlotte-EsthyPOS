import "dotenv/config";
import { db, pool } from "@/db";
import { users } from "@/db/schema";
import { isNull } from "drizzle-orm";

async function main() {
  const targetEmail = process.argv[2]?.trim().toLowerCase();

  if (targetEmail) {
    const updated = await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(isNull(users.emailVerifiedAt))
      .returning({ email: users.email });

    console.log(`Verified ${updated.length} user(s).`);
    return;
  }

  // Verify all currently unverified users
  const result = await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(isNull(users.emailVerifiedAt))
    .returning({ id: users.id, email: users.email });

  console.log(`✅ Successfully verified ${result.length} user account(s):`);
  for (const u of result) {
    console.log(` - ${u.email}`);
  }
}

main()
  .catch(console.error)
  .finally(() => pool.end());

