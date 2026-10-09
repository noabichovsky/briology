import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertClientAccess, buildTree, getSectionId } from "@/lib/data";
import { handle } from "@/lib/api";
import { SECTION_KEYS, type SectionKey } from "@/lib/sections";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client") ?? "";
    const section = url.searchParams.get("section") ?? "";

    if (!clientId || !SECTION_KEYS.includes(section as SectionKey)) {
      return NextResponse.json(
        { error: "client and section are required." },
        { status: 400 }
      );
    }
    assertClientAccess(user, clientId);
    const sectionId = await getSectionId(clientId, section as SectionKey);
    const tree = await buildTree(clientId, section as SectionKey);
    return NextResponse.json({ tree, sectionId });
  });
}
