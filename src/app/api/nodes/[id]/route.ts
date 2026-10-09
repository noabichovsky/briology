import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  assertClientAccess,
  nodeSectionId,
  sectionClientId,
  updateNode,
  deleteNodeRecursive,
} from "@/lib/data";
import { handle } from "@/lib/api";

/** Confirm the signed-in user may touch this node, or throw. */
async function assertNodeAccess(userId: Awaited<ReturnType<typeof requireUser>>, id: string) {
  const sectionId = await nodeSectionId(id);
  if (!sectionId) throw new Response("Not found", { status: 404 });
  const clientId = await sectionClientId(sectionId);
  if (!clientId) throw new Response("Not found", { status: 404 });
  assertClientAccess(userId, clientId);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertNodeAccess(user, id);
    const body = (await request.json()) as {
      name?: string;
      parent_id?: string | null;
    };
    await updateNode(id, {
      name: body.name,
      ...("parent_id" in body ? { parentId: body.parent_id ?? null } : {}),
    });
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    await assertNodeAccess(user, id);
    await deleteNodeRecursive(id);
    return NextResponse.json({ ok: true });
  });
}
