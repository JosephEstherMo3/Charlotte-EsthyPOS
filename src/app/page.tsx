import { redirect } from "next/navigation";
import { HomeRedirect } from "@/components/home-redirect";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const auth = await getAuth();
  if (auth) redirect("/dashboard");
  redirect("/login");
}
