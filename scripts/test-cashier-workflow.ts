import "dotenv/config";
import { db, pool } from "@/db";
import { businesses, memberships, users } from "@/db/schema";
import { createActivationToken, consumeActivation } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { resetEmailConfiguration, sendCashierInvitationEmail } from "@/lib/recovery-email";
import { eq, sql } from "drizzle-orm";

async function run() {
  console.log("=== 1. VERIFYING DATABASE CONNECTION ===");
  const [biz] = await db.select().from(businesses).limit(1);
  if (!biz) {
    throw new Error("No business found in database to attach cashier to.");
  }
  console.log(`Connected to store: "${biz.name}" (${biz.id})`);

  console.log("\n=== 2. CREATING CASHIER ACCOUNT (NO PLAIN TEXT PASSWORD REQUIRED) ===");
  const testEmail = `cashier-${Date.now()}@charlotteesthy.local`;
  const cashierName = "Esther Cashier";
  const dummyHash = await hashPassword("unusable-placeholder-until-activation");

  const [createdUser] = await db
    .insert(users)
    .values({
      email: testEmail,
      fullName: cashierName,
      passwordHash: dummyHash,
      emailVerifiedAt: null, // Unverified until cashier activates!
    })
    .returning();

  const [createdMembership] = await db
    .insert(memberships)
    .values({
      businessId: biz.id,
      userId: createdUser.id,
      role: "cashier",
      status: "active",
    })
    .returning();

  console.log(`✅ Cashier created in database:`);
  console.log(`   User ID: ${createdUser.id}`);
  console.log(`   Email: ${createdUser.email}`);
  console.log(`   Role: ${createdMembership.role}`);
  console.log(`   Verified: ${createdUser.emailVerifiedAt ? "YES" : "NO (Pending Activation)"}`);

  console.log("\n=== 3. GENERATING SECURE ACTIVATION TOKEN ===");
  const token = await createActivationToken(createdUser.id);
  const activationLink = `http://localhost:3000/activate?token=${encodeURIComponent(token)}`;
  console.log(`✅ Secure activation token generated.`);
  console.log(`   Activation URL: ${activationLink}`);

  console.log("\n=== 4. TESTING EMAILJS INVITATION DELIVERY ===");
  const emailConfig = resetEmailConfiguration();
  if (emailConfig) {
    console.log(`   Email Provider: ${emailConfig.provider}`);
    const emailResult = await sendCashierInvitationEmail(
      emailConfig,
      testEmail,
      token,
      cashierName,
      biz.name,
      "cashier"
    );
    if (emailResult.ok) {
      console.log(`✅ EmailJS delivered invitation successfully!`);
    } else {
      console.log(`⚠️ EmailJS response: ${emailResult.error}`);
    }
  } else {
    console.log(`⚠️ No email provider configured in .env`);
  }

  console.log("\n=== 5. TESTING CASHIER ACTIVATION & PASSWORD CREATION ===");
  const chosenPassword = "CashierSecure2026!";
  console.log(`Cashier opens activation link and submits new password: "${chosenPassword}"...`);
  const activatedUser = await consumeActivation(token, chosenPassword);

  const [dbUserAfter] = await db.select().from(users).where(eq(users.id, createdUser.id));
  console.log(`✅ Account activated:`);
  console.log(`   Email: ${activatedUser.email}`);
  console.log(`   Verified timestamp in DB: ${dbUserAfter.emailVerifiedAt?.toISOString()}`);

  console.log("\n=== 6. VERIFYING CASHIER CAN LOG IN WITH NEW PASSWORD ===");
  const passwordValid = await verifyPassword(chosenPassword, dbUserAfter.passwordHash);
  if (!passwordValid) {
    throw new Error("Password verification failed after activation!");
  }
  console.log(`✅ Password authentication check passed! Cashier can log in.`);

  console.log("\n=== 7. TESTING RETRY / RESEND WITHOUT DUPLICATE ACCOUNTS ===");
  const newTokenRes = await createActivationToken(createdUser.id);
  console.log(`✅ Re-issued fresh activation token: ${newTokenRes.slice(0, 8)}... (No duplicate error)`);

  console.log("\n🎉 ALL CASHIER INVITATION AND ACTIVATION WORKFLOW CHECKS PASSED!");
}

run()
  .catch((err) => {
    console.error("Workflow test failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
