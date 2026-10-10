import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  listClientMembers,
  addClientMember,
  removeClientMember,
} from "@/lib/data";
import { handle } from "@/lib/api";

/** List invited client members (admin only). */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const members = await listClientMembers();
    return NextResponse.json({
      members: members.map((m) => ({
        email: m.email,
        folderId: m.folderId,
        folderName: m.folderName,
      })),
    });
  });
}

/** Invite a client: email + the Drive folder they may see (admin only). */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = (await request.json()) as {
      email?: string;
      folderId?: string;
      folderName?: string;
    };
    const email = (body.email ?? "").trim();
    const folderId = (body.folderId ?? "").trim();
    const folderName = (body.folderName ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !folderId || !folderName) {
      return NextResponse.json(
        { error: "A valid email and a folder are required." },
        { status: 400 }
      );
    }
    await addClientMember(email, folderId, folderName, admin.id);
    return NextResponse.json({ ok: true });
  });
}

/** Remove a client's access (admin only). */
export async function DELETE(request: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const email = new URL(request.url).searchParams.get("email") ?? "";
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }
    await removeClientMember(email);
    return NextResponse.json({ ok: true });
  });
}
