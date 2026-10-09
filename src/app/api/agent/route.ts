import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, env } from "@/lib/cloudflare";
import { clients } from "@/db/schema";
import {
  assertClientAccess,
  getOrCreateChat,
  loadMessages,
  appendMessage,
} from "@/lib/data";
import {
  buildWorkspaceContext,
  selectedMediaNode,
} from "@/lib/agentContext";
import { SECTION_KEYS, type SectionKey } from "@/lib/sections";

const MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// System prompt — kept verbatim from the handoff spec.
const BASE_PROMPT = (client: string) =>
  `You are the Briology agent for Brio, a product design studio. Briology is the workspace where Brio and its client ${client} keep the product's vision, roadmap, field feedback and knowledge for the product. Answer using only the workspace content below; if something is not in it, say so. Reference files by name. Write plain text, no markdown, no headings. Be concise: a few short sentences or a short list using "- ".`;

const ASK_SUFFIX =
  " You answer questions about the content, connect related items across sections, and point out gaps or conflicts.";
const DESIGN_SUFFIX =
  " You are acting as a senior product designer giving a design opinion. Judge against the vision pillars, field feedback and design principles in the workspace. Say what works, what does not, and what to try next, specifically.";

/** Base64-encode bytes (for attaching PDFs/images to the model). */
function toBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function POST(request: NextRequest) {
  // --- Auth & input ---
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const body = (await request.json()) as {
    client_id?: string;
    section_key?: string;
    mode?: "ask" | "design";
    selected_node_id?: string | null;
    message?: string;
  };

  const clientId = body.client_id ?? "";
  const sectionKey = body.section_key as SectionKey;
  const mode: "ask" | "design" = body.mode === "design" ? "design" : "ask";
  const message = (body.message ?? "").trim();
  const selectedNodeId = body.selected_node_id ?? null;

  if (!clientId || !SECTION_KEYS.includes(sectionKey) || !message) {
    return Response.json(
      { error: "client_id, section_key and message are required." },
      { status: 400 }
    );
  }
  try {
    assertClientAccess(user, clientId);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The agent is not configured yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 }
    );
  }

  // --- Persist the user's message & load history ---
  const chatId = await getOrCreateChat(user.id, clientId, sectionKey, mode);
  await appendMessage(chatId, "user", message);
  const history = await loadMessages(chatId);

  // --- Build the request to Claude ---
  const db = getDb();
  const clientRow = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
  });
  const clientName = clientRow?.name ?? "the client";

  const instructions =
    BASE_PROMPT(clientName) + (mode === "design" ? DESIGN_SUFFIX : ASK_SUFFIX);
  const workspace = await buildWorkspaceContext(
    clientId,
    sectionKey,
    selectedNodeId
  );

  // Map stored history to Anthropic message turns.
  const messages: { role: "user" | "assistant"; content: unknown }[] =
    history.map((m) => ({ role: m.role, content: m.content }));

  // Attach a selected PDF/image to the latest user turn, if any.
  if (selectedNodeId) {
    const media = await selectedMediaNode(selectedNodeId);
    if (media?.row.r2Key) {
      const object = await env().MEDIA.get(media.row.r2Key);
      if (object) {
        const data = toBase64(await object.arrayBuffer());
        const block = media.isImage
          ? {
              type: "image",
              source: {
                type: "base64",
                media_type: media.row.mime ?? "image/png",
                data,
              },
            }
          : {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data,
              },
            };
        const last = messages[messages.length - 1];
        last.content = [block, { type: "text", text: message }];
      }
    }
  }

  const anthropicBody = {
    model: MODEL,
    max_tokens: 1024,
    stream: true,
    system: [
      { type: "text", text: instructions },
      {
        type: "text",
        text: "# Workspace content\n" + workspace,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  };

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(anthropicBody),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text();
    return Response.json(
      { error: `Agent request failed (${upstream.status}): ${detail}` },
      { status: 502 }
    );
  }

  // --- Stream Claude's SSE back to the browser as plain text chunks ---
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let full = "";

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload);
              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta"
              ) {
                const text = evt.delta.text as string;
                full += text;
                controller.enqueue(encoder.encode(text));
              }
            } catch {
              // ignore keep-alive / non-JSON lines
            }
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `\n[error] ${err instanceof Error ? err.message : String(err)}`
          )
        );
      } finally {
        // Persist the assistant's full reply.
        if (full.trim()) await appendMessage(chatId, "assistant", full.trim());
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
