import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, pool } from '@/db';
import { users } from '@/db/schema';
import { hashPassword } from '@/lib/password';

async function main() {
  const email = process.argv[2] || 'charlotteesthy49@gmail.com';
  const password = process.argv[3];
  if (!password) {
    console.error('Usage: npx tsx scripts/set-password.ts <email> <newPassword>');
    process.exit(1);
  }
  const hash = await hashPassword(password);

  await db
    .update(users)
    .set({
      passwordHash: hash,
      emailVerifiedAt: new Date(),
    })
    .where(eq(users.email, email));

  console.log(`Password for ${email} successfully updated.`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => pool.end());
