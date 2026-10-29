import 'dotenv/config';
import { db, pool } from '@/db';
import { users, businesses, memberships } from '@/db/schema';

async function main() {
  const u = await db.select().from(users);
  const b = await db.select().from(businesses);
  const m = await db.select().from(memberships);

  console.log('--- USERS ---');
  for (const user of u) {
    console.log(`Email: ${user.email} | Name: ${user.fullName} | Verified: ${user.emailVerifiedAt ? 'YES' : 'NO'}`);
  }

  console.log('\n--- BUSINESSES ---');
  for (const biz of b) {
    console.log(`ID: ${biz.id} | Name: ${biz.name}`);
  }

  console.log('\n--- MEMBERSHIPS ---');
  for (const mem of m) {
    console.log(`Biz: ${mem.businessId} | User: ${mem.userId} | Role: ${mem.role} | Status: ${mem.status}`);
  }
}

main()
  .catch((err) => console.error(err))
  .finally(() => pool.end());
