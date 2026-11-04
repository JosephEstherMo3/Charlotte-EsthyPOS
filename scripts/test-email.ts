import "dotenv/config";
import { resetEmailConfiguration, sendVerificationEmail, sendCashierInvitationEmail } from "@/lib/recovery-email";

async function main() {
  const targetEmail = process.argv[2]?.trim();
  const overrideTemplateId = process.argv[3]?.trim();

  if (!targetEmail) {
    console.log("Usage: npx tsx scripts/test-email.ts <your-email@example.com> [optional_template_id]");
    process.exit(1);
  }

  const config = resetEmailConfiguration();
  if (!config) {
    console.error("❌ No email provider configured!");
    console.log("\nPlease add your EmailJS credentials to your .env file:");
    console.log("EMAILJS_SERVICE_ID=service_xxxxxxx");
    console.log("EMAILJS_TEMPLATE_ID=template_xxxxxxx");
    console.log("EMAILJS_PUBLIC_KEY=xxxxxxx_xxxxxxx");
    console.log("EMAILJS_PRIVATE_KEY=xxxxxxx_xxxxxxx (optional)");
    process.exit(1);
  }

  if (overrideTemplateId && config.provider === "emailjs") {
    config.templateId = overrideTemplateId;
  }

  console.log(`📧 Testing email delivery using provider: ${config.provider}`);
  if (config.provider === "emailjs") {
    console.log(`   Service ID: ${config.serviceId}`);
    console.log(`   Template ID: ${config.templateId}`);
    console.log(`   Public Key: ${config.publicKey.slice(0, 5)}...`);
    console.log(`   Private Key: ${config.privateKey ? "Configured (Strict Mode ready)" : "None"}`);
  }
  console.log(`\n1. Sending test cashier invitation to: ${targetEmail}...`);

  const mockToken = "test_invite_token_1234567890123456789012345678";
  const result = await sendCashierInvitationEmail(
    config,
    targetEmail,
    mockToken,
    "Jane Cashier",
    "Charlotte Esthy Boutique",
    "cashier"
  );

  if (result.ok) {
    console.log("✅ Invitation email sent successfully! Check your inbox.");
  } else {
    console.error("❌ Failed to send invitation email.");
    console.error(`   Error details: ${result.error}`);
  }
}

main().catch(console.error);
