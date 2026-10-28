/**
 * Server-operator password recovery — NOT exposed over HTTP.
 *
 * Run from a trusted shell with DATABASE_URL configured:
 *   npm run account:reset -- --email=owner@example.com
 *
 * The temporary password is generated at random and printed ONE TIME to the
 * operator's terminal. Deliver it privately to the verified account owner.
 * Never paste the generated password into support tickets, logs or chat.
 */
import "dotenv/config";
import { pool } from "@/db";
import { resetPasswordAsOperator } from "@/lib/services/account-recovery";

async function main() {
  const flag = process.argv.find((arg) => arg.startsWith("--email="));
  const positional = process.argv.indexOf("--email");
  const email = flag?.slice("--email=".length) ?? (positional >= 0 ? process.argv[positional + 1] : undefined);
  if (!email) {
    console.error("Usage: npm run account:reset -- --email=owner@example.com");
    process.exitCode = 1;
    return;
  }
  const { temporaryPassword, fullName } = await resetPasswordAsOperator(email);
  console.log(`Account recovered for ${fullName}. All prior sessions and reset links have been revoked.`);
  console.log("Temporary password (shown only once):", temporaryPassword);
  console.log("Give this to the VERIFIED account owner privately; they should change it in Settings immediately.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unable to reset this account.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
