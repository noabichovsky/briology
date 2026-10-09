import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  assertClientAccess,
  getAgentNotes,
  replaceAgentNotes,
  type ObservationDTO,
  type ThemeDTO,
} from "@/lib/data";
import { buildWorkspaceContext } from "@/lib/agentContext";
import { handle } from "@/lib/api";
import { SECTION_KEYS, sectionName, type SectionKey } from "@/lib/sections";

const MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function parse(request: NextRequest) {
  const url = new URL(request.url);
  return {
    clientId: url.searchParams.get("client") ?? "",
    section: url.searchParams.get("section") ?? "",
  };
}

export async function GET(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { clientId, section } = parse(request);
    if (!clientId || !SECTION_KEYS.includes(section as SectionKey)) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    assertClientAccess(user, clientId);
    const data = await getAgentNotes(clientId, section as SectionKey);
    return NextResponse.json(data);
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { clientId, section } = parse(request);
    if (!clientId || !SECTION_KEYS.includes(section as SectionKey)) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    assertClientAccess(user, clientId);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Not configured (missing ANTHROPIC_API_KEY)." },
        { status: 503 }
      );
    }

    const key = section as SectionKey;
    const workspace = await buildWorkspaceContext(clientId, key);
    const isField = key === "field";

    const instruction =
      `You are the Briology agent for Brio, a product design studio. Look at the ${sectionName(key)} section of the workspace below and surface what a senior designer would notice: gaps, conflicts, and things worth a closer look. ` +
      `Base everything only on the workspace content; if there is little content, return few or no observations. ` +
      `Return ONLY valid JSON (no markdown, no prose) of the form: ` +
      `{"notes":[{"title":string,"body":string,"severity":"High"|null,"linkLabel":string|null}]` +
      (isField ? `,"themes":[{"name":string,"count":number}]` : "") +
      `}. Give 0-4 concise notes. ${isField ? "Give 0-5 recurring themes with rough counts from the field feedback." : ""}`;

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: "text", text: instruction }],
        messages: [
          {
            role: "user",
            content: "# Workspace content\n" + workspace,
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Generation failed (${res.status}): ${detail}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text =
      data.content?.find((b) => b.type === "text")?.text?.trim() ?? "";

    // Tolerate accidental code fences around the JSON.
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let notes: ObservationDTO[] = [];
    let themes: ThemeDTO[] = [];
    try {
      const parsed = JSON.parse(cleaned) as {
        notes?: ObservationDTO[];
        themes?: ThemeDTO[];
      };
      notes = Array.isArray(parsed.notes) ? parsed.notes.slice(0, 4) : [];
      themes = Array.isArray(parsed.themes) ? parsed.themes.slice(0, 5) : [];
    } catch {
      return NextResponse.json(
        { error: "Could not parse the generated observations." },
        { status: 502 }
      );
    }

    await replaceAgentNotes(clientId, key, notes, themes);
    return NextResponse.json({ notes, themes });
  });
}
