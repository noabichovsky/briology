import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  assertClientAccess,
  getOrCreateChat,
  loadMessages,
  clearChat,
} from "@/lib/data";
import { handle } from "@/lib/api";
import { SECTION_KEYS, type SectionKey } from "@/lib/sections";

function parse(request: NextRequest) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client") ?? "";
  const section = url.searchParams.get("section") ?? "";
  const mode = url.searchParams.get("mode") === "design" ? "design" : "ask";
  return { clientId, section, mode } as const;
}

export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { clientId, section, mode } = parse(request);
    if (!clientId || !SECTION_KEYS.includes(section as SectionKey)) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    assertClientAccess(user, clientId);
    const chatId = await getOrCreateChat(
      user.id,
      clientId,
      section as SectionKey,
      mode
    );
    const messages = await loadMessages(chatId);
    return NextResponse.json({ messages });
  });
}

export async function DELETE(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { clientId, section, mode } = parse(request);
    if (!clientId || !SECTION_KEYS.includes(section as SectionKey)) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    assertClientAccess(user, clientId);
    const chatId = await getOrCreateChat(
      user.id,
      clientId,
      section as SectionKey,
      mode
    );
    await clearChat(chatId);
    return NextResponse.json({ ok: true });
  });
}
