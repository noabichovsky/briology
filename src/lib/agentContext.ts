import { eq } from "drizzle-orm";
import { getDb } from "@/lib/cloudflare";
import { sections, nodes, agentNotes } from "@/db/schema";
import {
  SECTIONS,
  TYPE_TAG,
  sectionName,
  type SectionKey,
} from "@/lib/sections";

const MAX_TEXT_PER_FILE = 20_000;

type NodeRow = typeof nodes.$inferSelect;

/** Build an indented outline of a section's folder/file tree. */
function outline(rows: NodeRow[]): string {
  const byParent = new Map<string | null, NodeRow[]>();
  for (const r of rows) {
    const arr = byParent.get(r.parentId) ?? [];
    arr.push(r);
    byParent.set(r.parentId, arr);
  }
  const render = (parentId: string | null, depth: number): string => {
    const list = byParent.get(parentId) ?? [];
    return list
      .map((n) => {
        const pad = "  ".repeat(depth);
        if (n.kind === "folder") {
          return `${pad}- [folder] ${n.name}\n${render(n.id, depth + 1)}`;
        }
        const tag = TYPE_TAG[n.fileType ?? ""] ?? n.fileType ?? "File";
        return `${pad}- [${tag}] ${n.name}${n.isNew ? " [new]" : ""}\n`;
      })
      .join("");
  };
  return render(null, 0);
}

/**
 * Assemble the full workspace content string for one client, mirroring the
 * prototype's context(): outline + agent notes + extracted file text, with the
 * current section flagged and the selected file noted at the end.
 */
export async function buildWorkspaceContext(
  clientId: string,
  currentSection: SectionKey,
  selectedNodeId?: string | null
): Promise<string> {
  const db = getDb();

  const sectionRows = await db
    .select()
    .from(sections)
    .where(eq(sections.clientId, clientId));
  const sectionByKey = new Map(sectionRows.map((s) => [s.key, s]));

  const blocks: string[] = [];
  const texts: string[] = [];
  let selectedFileLine = "";

  for (const def of SECTIONS) {
    const section = sectionByKey.get(def.key);
    if (!section) continue;

    const rows = await db
      .select()
      .from(nodes)
      .where(eq(nodes.sectionId, section.id));

    const notes = await db
      .select()
      .from(agentNotes)
      .where(eq(agentNotes.sectionId, section.id));

    let block =
      `## ${def.name}${def.key === currentSection ? " (current section)" : ""}\n` +
      `Files:\n${outline(rows) || "(empty)\n"}`;

    if (notes.length) {
      block +=
        `\nNotes:\n` +
        notes
          .map(
            (o) =>
              `* ${o.title}: ${o.body}` +
              (o.linkLabel ? ` (${o.linkLabel})` : "")
          )
          .join("\n") +
        "\n";
    }
    blocks.push(block);

    for (const n of rows) {
      if (n.kind === "file" && n.text) {
        texts.push(
          `### ${n.name} (${def.name})\n${n.text.slice(0, MAX_TEXT_PER_FILE)}`
        );
      }
      if (selectedNodeId && n.id === selectedNodeId) {
        selectedFileLine = `\n\nThe user currently has this file selected: ${n.name}`;
      }
    }
  }

  const all = blocks.join("\n\n");
  const fileContents = texts.length
    ? `\n\n# File contents\n${texts.join("\n\n")}`
    : "\n\n(No file contents have been extracted; only names are known.)";

  return all + fileContents + selectedFileLine;
}

/** The selected file's stored row, if it is a PDF or image (for attachments). */
export async function selectedMediaNode(nodeId: string) {
  const db = getDb();
  const row = await db.query.nodes.findFirst({ where: eq(nodes.id, nodeId) });
  if (!row || row.kind !== "file" || !row.r2Key) return null;
  const mime = row.mime ?? "";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf" || row.name.toLowerCase().endsWith(".pdf");
  if (!isImage && !isPdf) return null;
  return { row, isImage, isPdf };
}

export { sectionName };
