import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { db, pool } from '@/db';
import { users, memberships, businesses } from '@/db/schema';
import { hashPassword } from '@/lib/password';
import type { Role } from '@/lib/permissions';

async function main() {
  const args = process.argv.slice(2);
  const email = args[0]?.trim().toLowerCase();
  const password = args[1];
  const role = (args[2]?.toLowerCase() || 'cashier') as Role;
  const fullName = args[3]?.trim() || 'Team Member';

  if (!email || !password) {
    console.log('Usage: npx tsx scripts/add-team-user.ts <email> <password> [role: owner|manager|cashier] [fullName]');
    process.exit(1);
  }

  // Find Charlotte Esthy Boutique
  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.name, 'Charlotte Esthy Boutique'))
    .limit(1);

  if (!biz) {
    console.error('Could not find business "Charlotte Esthy Boutique"');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  // Check if user exists
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    await db
      .update(users)
      .set({
        passwordHash,
        fullName: fullName || existingUser.fullName,
        emailVerifiedAt: new Date(),
      })
      .where(eq(users.id, userId));
    console.log(`Updated existing user ${email} (ID: ${userId})`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        fullName,
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
    userId = created.id;
    console.log(`Created new user ${email} (ID: ${userId})`);
  }

  // Ensure active membership in Charlotte Esthy Boutique
  const [existingMem] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.businessId, biz.id), eq(memberships.userId, userId)))
    .limit(1);

  if (existingMem) {
    await db
      .update(memberships)
      .set({
        role,
        status: 'active',
      })
      .where(eq(memberships.id, existingMem.id));
    console.log(`Updated membership for ${email} in ${biz.name} to role: ${role}, status: active`);
  } else {
    await db.insert(memberships).values({
      businessId: biz.id,
      userId,
      role,
      status: 'active',
    });
    console.log(`Added active membership for ${email} in ${biz.name} with role: ${role}`);
  }

  console.log(`\nSUCCESS: User ${email} can now sign in immediately from any browser!`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => pool.end());
