import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDriveRoot, getClientMemberByEmail } from "@/lib/data";
import {
  accessTokenFromRefresh,
  getFileText,
  collectFiles,
  isWithinFolder,
  type DriveFile,
} from "@/lib/googleDrive";

const MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

type Selected = { id: string; kind: "folder" | "file"; name: string; mimeType?: string };

export async function POST(request: NextRequest) {
  const user = await requireUser().catch((e) => e as Response);
  if (user instanceof Response) return user;

  const body = (await request.json()) as {
    selected?: Selected[];
    message?: string;
    history?: { role: "user" | "assistant"; text: string }[];
  };
  const message = (body.message ?? "").trim();
  const selected = body.selected ?? [];
  const history = body.history ?? [];
  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The agent is not configured yet (missing ANTHROPIC_API_KEY)." },
      { status: 503 }
    );
  }

  const root = await getDriveRoot();
  if (!root) {
    return Response.json(
      { error: "No Google Drive folder is connected yet." },
      { status: 400 }
    );
  }

  // For client users, restrict selection to their own folder subtree.
  let allowedRoot: string | null = null;
  if (user.role !== "admin") {
    const member = await getClientMemberByEmail(user.email);
    if (!member) {
      return Response.json(
        { error: "No workspace has been assigned to your account yet." },
        { status: 403 }
      );
    }
    allowedRoot = member.folderId;
  }

  // Gather the text of the selected files (and files inside selected folders).
  let contextText = "";
  try {
    const accessToken = await accessTokenFromRefresh(root.refreshToken);
    // Drop any selected item a client isn't allowed to see.
    let allowed = selected;
    if (allowedRoot) {
      const checks = await Promise.all(
        selected.map((s) => isWithinFolder(accessToken, s.id, allowedRoot!))
      );
      allowed = selected.filter((_, i) => checks[i]);
    }
    const files: DriveFile[] = [];
    for (const sel of allowed) {
      if (sel.kind === "file") {
        files.push({
          id: sel.id,
          name: sel.name,
          kind: "file",
          mimeType: sel.mimeType ?? "application/octet-stream",
          size: null,
          modifiedTime: null,
        });
      } else {
        const inside = await collectFiles(accessToken, sel.id, 25);
        files.push(...inside);
      }
    }
    const capped = files.slice(0, 25);
    const parts: string[] = [];
    for (const f of capped) {
      const text = await getFileText(accessToken, f.id, f.mimeType);
      parts.push(
        `### ${f.name}\n${text ?? "(This file type can't be read as text yet.)"}`
      );
    }
    contextText = parts.join("\n\n") || "(No files selected.)";
  } catch (err) {
    return Response.json(
      {
        error:
          "Could not read the selected Drive files: " +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 502 }
    );
  }

  const selectionLabel =
    selected.map((s) => s.name).join(", ") || "the workspace";
  const instructions =
    `You are the Briology agent for Brio, a product design studio. The user is asking about the following Google Drive items: ${selectionLabel}. ` +
    `Answer using only the file contents provided below; if something isn't in them, say so. Reference files by name. Write plain text, no markdown, no headings. Be concise.`;

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.text })),
    { role: "user" as const, content: message },
  ];

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      stream: true,
      system: [
        { type: "text", text: instructions },
        {
          type: "text",
          text: "# Selected file contents\n" + contextText,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text();
    return Response.json(
      { error: `Agent request failed (${upstream.status}): ${detail}` },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
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
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload);
              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta"
              ) {
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch {
              /* ignore */
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
