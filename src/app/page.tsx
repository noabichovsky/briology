import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BASE_PATH } from "@/lib/basePath";
import DriveApp from "@/components/DriveApp";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect(`${BASE_PATH}/login`);

  return <DriveApp user={{ email: user.email, role: user.role }} />;
}
