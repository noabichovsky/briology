import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, env } from "@/lib/cloudflare";
import { nodes } from "@/db/schema";
import {
  assertClientAccess,
  sectionClientId,
} from "@/lib/data";
import { handle } from "@/lib/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const db = getDb();
    const node = await db.query.nodes.findFirst({ where: eq(nodes.id, id) });
    if (!node || node.kind !== "file" || !node.r2Key) {
      return new Response("Not found", { status: 404 });
    }
    const clientId = await sectionClientId(node.sectionId);
    if (!clientId) return new Response("Not found", { status: 404 });
    assertClientAccess(user, clientId);

    const object = await env().MEDIA.get(node.r2Key);
    if (!object) return new Response("Not found", { status: 404 });

    return new Response(object.body, {
      headers: {
        "Content-Type": node.mime ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(node.name)}"`,
      },
    });
  });
}
