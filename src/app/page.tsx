import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DriveApp from "@/components/DriveApp";

export default async function Home() {
  const user = await getCurrentUser();
  // Next.js adds the mount path (basePath) automatically — don't prefix it here.
  if (!user) redirect("/login");

  return <DriveApp user={{ email: user.email, role: user.role }} />;
}
