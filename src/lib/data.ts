import { and, eq, inArray, asc } from "drizzle-orm";
import { getDb, env } from "@/lib/cloudflare";
import {
  clients,
  sections,
  nodes,
  chats,
  messages,
  agentNotes,
  driveLinks,
  type User,
} from "@/db/schema";
import { SECTION_KEYS, fileTypeForName, type SectionKey } from "@/lib/sections";
import type { ClientDTO, TreeNode } from "@/lib/types";

export type { ClientDTO, TreeNode };

/** Files whose text we can read directly (no special parser needed). */
const TEXTUAL = /\.(txt|md|csv|json|html?|eml|rtf|xml|ya?ml)$/i;
const MAX_TEXT_BYTES = 2_000_000;

/** Clients this user may see. Admins: all. Clients: just their own. */
export async function listClients(user: User): Promise<ClientDTO[]> {
  const db = getDb();
  if (user.role === "admin") {
    const rows = await db.select().from(clients).orderBy(clients.name);
    return rows.map((c) => ({ id: c.id, name: c.name }));
  }
  if (!user.clientId) return [];
  const row = await db.query.clients.findFirst({
    where: eq(clients.id, user.clientId),
  });
  return row ? [{ id: row.id, name: row.name }] : [];
}

/** Throw 403 unless the user may access this client. */
export function assertClientAccess(user: User, clientId: string): void {
  if (user.role === "admin") return;
  if (user.clientId !== clientId) {
    throw new Response("Forbidden", { status: 403 });
  }
}

/** Create a client and its four sections in one go (admin only). */
export async function createClientWithSections(
  name: string
): Promise<ClientDTO> {
  const db = getDb();
  const [client] = await db
    .insert(clients)
    .values({ name: name.trim() || "Untitled client" })
    .returning();
  await db
    .insert(sections)
    .values(SECTION_KEYS.map((key) => ({ clientId: client.id, key })));
  return { id: client.id, name: client.name };
}

/** Delete a client, its content, and any stored files (admin only). */
export async function deleteClient(clientId: string): Promise<void> {
  const db = getDb();
  // Collect R2 keys to remove before the DB cascade wipes the rows.
  const sectionRows = await db
    .select({ id: sections.id })
    .from(sections)
    .where(eq(sections.clientId, clientId));
  for (const s of sectionRows) {
    const fileRows = await db
      .select({ r2Key: nodes.r2Key })
      .from(nodes)
      .where(eq(nodes.sectionId, s.id));
    for (const f of fileRows) {
      if (f.r2Key) await env().MEDIA.delete(f.r2Key);
    }
  }
  // FK "on delete cascade" removes sections, nodes, chats, messages.
  await db.delete(clients).where(eq(clients.id, clientId));
}

/** The section row id for a given client + section key. */
export async function getSectionId(
  clientId: string,
  key: SectionKey
): Promise<string | null> {
  const db = getDb();
  const row = await db.query.sections.findFirst({
    where: and(eq(sections.clientId, clientId), eq(sections.key, key)),
  });
  return row?.id ?? null;
}

/** Build the nested folder/file tree for a client's section. */
export async function buildTree(
  clientId: string,
  key: SectionKey
): Promise<TreeNode[]> {
  const db = getDb();
  const sectionId = await getSectionId(clientId, key);
  if (!sectionId) return [];

  const rows = await db
    .select()
    .from(nodes)
    .where(eq(nodes.sectionId, sectionId));

  // Group children by parent for quick assembly.
  const byParent = new Map<string | null, TreeNode[]>();
  for (const r of rows) {
    const node: TreeNode = {
      id: r.id,
      kind: r.kind,
      name: r.name,
      fileType: r.fileType,
      mime: r.mime,
      size: r.size,
      isNew: r.isNew,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.getTime()
          : Number(r.createdAt) * 1000,
      ...(r.kind === "folder" ? { children: [] } : {}),
    };
    const list = byParent.get(r.parentId) ?? [];
    list.push(node);
    byParent.set(r.parentId, list);
  }

  const attach = (parentId: string | null): TreeNode[] => {
    const list = byParent.get(parentId) ?? [];
    for (const n of list) {
      if (n.kind === "folder") n.children = attach(n.id);
    }
    return list;
  };
  return attach(null);
}

// ---- Node operations (folders & files) -------------------------------------

/** The client that owns a section, for access checks. */
export async function sectionClientId(
  sectionId: string
): Promise<string | null> {
  const db = getDb();
  const row = await db.query.sections.findFirst({
    where: eq(sections.id, sectionId),
  });
  return row?.clientId ?? null;
}

/** The section a node belongs to, for access checks. */
export async function nodeSectionId(nodeId: string): Promise<string | null> {
  const db = getDb();
  const row = await db.query.nodes.findFirst({ where: eq(nodes.id, nodeId) });
  return row?.sectionId ?? null;
}

export async function createFolder(
  sectionId: string,
  parentId: string | null,
  name: string,
  userId: string
): Promise<TreeNode> {
  const db = getDb();
  const [row] = await db
    .insert(nodes)
    .values({
      sectionId,
      parentId,
      kind: "folder",
      name: name.trim() || "Untitled folder",
      isNew: false,
      createdBy: userId,
    })
    .returning();
  return {
    id: row.id,
    kind: "folder",
    name: row.name,
    fileType: null,
    mime: null,
    size: null,
    isNew: row.isNew,
    createdAt: row.createdAt.getTime(),
    children: [],
  };
}

/** Store an uploaded file in Object Storage and record it in the database. */
export async function createFileFromUpload(
  sectionId: string,
  parentId: string | null,
  file: File,
  userId: string
): Promise<TreeNode> {
  const db = getDb();
  const bytes = await file.arrayBuffer();
  const r2Key = `${sectionId}/${crypto.randomUUID()}-${file.name}`;
  await env().MEDIA.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  let text: string | null = null;
  if (TEXTUAL.test(file.name) && bytes.byteLength < MAX_TEXT_BYTES) {
    try {
      text = new TextDecoder().decode(bytes);
    } catch {
      text = null;
    }
  }

  const [row] = await db
    .insert(nodes)
    .values({
      sectionId,
      parentId,
      kind: "file",
      name: file.name,
      fileType: fileTypeForName(file.name),
      mime: file.type || null,
      size: file.size,
      r2Key,
      text,
      isNew: true,
      createdBy: userId,
    })
    .returning();

  return {
    id: row.id,
    kind: "file",
    name: row.name,
    fileType: row.fileType,
    mime: row.mime,
    size: row.size,
    isNew: row.isNew,
    createdAt: row.createdAt.getTime(),
  };
}

/** Rename and/or move a node. */
export async function updateNode(
  nodeId: string,
  changes: { name?: string; parentId?: string | null }
): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof changes.name === "string") set.name = changes.name.trim();
  if ("parentId" in changes) set.parentId = changes.parentId ?? null;
  await db.update(nodes).set(set).where(eq(nodes.id, nodeId));
}

/** Delete a node and all of its descendants, removing stored files too. */
export async function deleteNodeRecursive(nodeId: string): Promise<void> {
  const db = getDb();
  const sectionId = await nodeSectionId(nodeId);
  if (!sectionId) return;

  // Load the whole section so we can walk the subtree (parent_id is not a FK).
  const rows = await db
    .select({ id: nodes.id, parentId: nodes.parentId, r2Key: nodes.r2Key })
    .from(nodes)
    .where(eq(nodes.sectionId, sectionId));

  const childrenOf = new Map<string | null, string[]>();
  const r2By: Record<string, string | null> = {};
  for (const r of rows) {
    const arr = childrenOf.get(r.parentId) ?? [];
    arr.push(r.id);
    childrenOf.set(r.parentId, arr);
    r2By[r.id] = r.r2Key;
  }

  const toDelete: string[] = [];
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    toDelete.push(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }

  for (const id of toDelete) {
    const key = r2By[id];
    if (key) await env().MEDIA.delete(key);
  }
  await db.delete(nodes).where(inArray(nodes.id, toDelete));
}

// ---- Chats & messages ------------------------------------------------------

/** Find (or create) the one conversation for a user × client × section × mode. */
export async function getOrCreateChat(
  userId: string,
  clientId: string,
  sectionKey: SectionKey,
  mode: "ask" | "design"
): Promise<string> {
  const db = getDb();
  const existing = await db.query.chats.findFirst({
    where: and(
      eq(chats.userId, userId),
      eq(chats.clientId, clientId),
      eq(chats.sectionKey, sectionKey),
      eq(chats.mode, mode)
    ),
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(chats)
    .values({ userId, clientId, sectionKey, mode })
    .returning();
  return created.id;
}

export async function loadMessages(
  chatId: string
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt));
  return rows.map((r) => ({ role: r.role, content: r.content }));
}

export async function appendMessage(
  chatId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const db = getDb();
  await db.insert(messages).values({ chatId, role, content });
}

/** Clear all messages in a conversation (the "New chat" button). */
export async function clearChat(chatId: string): Promise<void> {
  const db = getDb();
  await db.delete(messages).where(eq(messages.chatId, chatId));
}

// ---- Agent observations ("What I'm noticing") ------------------------------
//
// Observations are stored in agent_notes. Field "theme bars" don't have their
// own table in the data model, so we store them in a single reserved row whose
// title is "__themes__" and whose body is a JSON array of {name, count}. The
// UI filters that row out of the notes list and renders it as bars.

const THEME_ROW_TITLE = "__themes__";

export type ObservationDTO = {
  title: string;
  body: string;
  severity: string | null;
  linkLabel: string | null;
};
export type ThemeDTO = { name: string; count: number };

export async function getAgentNotes(
  clientId: string,
  key: SectionKey
): Promise<{ notes: ObservationDTO[]; themes: ThemeDTO[] }> {
  const db = getDb();
  const sectionId = await getSectionId(clientId, key);
  if (!sectionId) return { notes: [], themes: [] };

  const rows = await db
    .select()
    .from(agentNotes)
    .where(eq(agentNotes.sectionId, sectionId))
    .orderBy(asc(agentNotes.createdAt));

  const notes: ObservationDTO[] = [];
  let themes: ThemeDTO[] = [];
  for (const r of rows) {
    if (r.title === THEME_ROW_TITLE) {
      try {
        themes = JSON.parse(r.body) as ThemeDTO[];
      } catch {
        themes = [];
      }
      continue;
    }
    notes.push({
      title: r.title,
      body: r.body,
      severity: r.severity,
      linkLabel: r.linkLabel,
    });
  }
  return { notes, themes };
}

/** Replace all stored observations for a section. */
export async function replaceAgentNotes(
  clientId: string,
  key: SectionKey,
  notes: ObservationDTO[],
  themes: ThemeDTO[]
): Promise<void> {
  const db = getDb();
  const sectionId = await getSectionId(clientId, key);
  if (!sectionId) return;

  await db.delete(agentNotes).where(eq(agentNotes.sectionId, sectionId));

  const rows = notes.map((n) => ({
    sectionId,
    title: n.title,
    body: n.body,
    severity: n.severity ?? null,
    linkLabel: n.linkLabel ?? null,
    mode: "ask" as const,
  }));
  if (themes.length) {
    rows.push({
      sectionId,
      title: THEME_ROW_TITLE,
      body: JSON.stringify(themes),
      severity: null,
      linkLabel: null,
      mode: "ask" as const,
    });
  }
  if (rows.length) await db.insert(agentNotes).values(rows);
}

// ---- Google Drive links ----------------------------------------------------

export async function getDriveLink(clientId: string) {
  const db = getDb();
  return (
    (await db.query.driveLinks.findFirst({
      where: eq(driveLinks.clientId, clientId),
    })) ?? null
  );
}

/** Save (or replace) the Drive folder connection for a client. */
export async function upsertDriveLink(
  clientId: string,
  folderId: string,
  refreshToken: string,
  userId: string
): Promise<void> {
  const db = getDb();
  await db.delete(driveLinks).where(eq(driveLinks.clientId, clientId));
  await db.insert(driveLinks).values({
    clientId,
    folderId,
    refreshToken,
    connectedBy: userId,
  });
}

export async function deleteDriveLink(clientId: string): Promise<void> {
  const db = getDb();
  await db.delete(driveLinks).where(eq(driveLinks.clientId, clientId));
}
