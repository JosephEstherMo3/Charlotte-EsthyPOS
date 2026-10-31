import "dotenv/config";
import { resetEmailConfiguration, sendVerificationEmail } from "@/lib/recovery-email";

async function main() {
  const targetEmail = process.argv[2]?.trim();
  if (!targetEmail) {
    console.log("Usage: npx tsx scripts/test-email.ts <your-email@example.com>");
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

  console.log(`📧 Testing email delivery using provider: ${config.provider}`);
  console.log(`Sending test verification link to: ${targetEmail}...`);

  const mockToken = "test_token_123456789012345678901234567890123";
  const ok = await sendVerificationEmail(config, targetEmail, mockToken, "Test User", "Charlotte Esthy");

  if (ok) {
    console.log("✅ Email sent successfully! Check your inbox.");
  } else {
    console.error("❌ Failed to send email. Check your EmailJS dashboard, Service ID, and Template ID.");
  }
}

main().catch(console.error);
