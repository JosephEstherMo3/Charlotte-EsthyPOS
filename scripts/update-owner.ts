/**
 * Update the Demo Owner account with your own email, password and name.
 * 
 * Usage:
 *   npx tsx scripts/update-owner.ts "your.email@example.com" "YourNewPassword123!" "Your Full Name"
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { sessions, embeddedSessions, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";

async function main() {
  const args = process.argv.slice(2);
  const newEmail = args[0]?.trim().toLowerCase();
  const newPassword = args[1];
  const newName = args[2]?.trim();

  if (!newEmail || !newPassword) {
    console.log("Usage: npx tsx scripts/update-owner.ts <new-email> <new-password> [full-name]");
    process.exitCode = 1;
    return;
  }
  if (newPassword.length > 128) {
    console.error("Password must be at most 128 characters.");
    process.exitCode = 1;
    return;
  }

  // Find demo owner (or current owner user)
  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.email, "demo.owner@charlotteesthy.test"));

  const targetUser = owner ?? (await db.select().from(users).limit(1))[0];

  if (!targetUser) {
    console.error("No user found to update in the database.");
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({
      email: newEmail,
      passwordHash,
      fullName: newName || targetUser.fullName,
      emailVerifiedAt: new Date(),
    })
    .where(eq(users.id, targetUser.id));

  // Invalidate any existing old demo sessions
  await db.delete(sessions).where(eq(sessions.userId, targetUser.id));
  await db.delete(embeddedSessions).where(eq(embeddedSessions.userId, targetUser.id));

  console.log(`\n Account updated successfully!`);
  console.log(`Email:    ${newEmail}`);
  console.log(`Name:     ${newName || targetUser.fullName}`);
  console.log(`\nYou can now sign in at http://localhost:3000/login with your credentials.\n`);
}

main()
  .catch((err) => {
    console.error("Error updating account:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
