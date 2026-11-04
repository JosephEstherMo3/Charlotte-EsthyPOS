import "dotenv/config";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

async function checkTemplate(templateId: string) {
  const serviceId = process.env.EMAILJS_SERVICE_ID || "service_foazko9";
  const publicKey = process.env.EMAILJS_PUBLIC_KEY || "sbWcN1e_j2W1DbqRh";
  const privateKey = process.env.EMAILJS_PRIVATE_KEY || "UegHWlecBSuEgA0zxAvO9";

  console.log(`Checking EmailJS template: "${templateId}" with Service: "${serviceId}"...`);
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        to_email: "charlotteesthy49@gmail.com",
        to_name: "Charlotte Esthy",
        business_name: "Charlotte Esthy POS",
        activation_link: "http://localhost:3000/activate?token=test",
        verification_link: "http://localhost:3000/verify-email?token=test",
      },
    }),
  });

  const text = await res.text();
  console.log(`Response Status: ${res.status}`);
  console.log(`Response Body: ${text}`);
  if (res.ok) {
    console.log("\n🎉 SUCCESS! This Template ID is valid and active on EmailJS!");
  } else {
    console.log("\n❌ Not found on EmailJS:", text);
  }
}

const id = process.argv[2] || process.env.EMAILJS_TEMPLATE_ID || "template_dlfnvnh";
checkTemplate(id);

