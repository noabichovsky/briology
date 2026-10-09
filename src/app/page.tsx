import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listClients } from "@/lib/data";
import { BASE_PATH } from "@/lib/basePath";
import Workspace from "@/components/Workspace";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect(`${BASE_PATH}/login`);

  const clients = await listClients(user);
  const initialClientId =
    user.role === "client" ? user.clientId ?? null : clients[0]?.id ?? null;

  return (
    <Workspace
      user={{ email: user.email, role: user.role }}
      initialClients={clients}
      initialClientId={initialClientId}
    />
  );
}
