import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// A short, URL-safe unique id generated in the app (edge-compatible).
const newId = () => crypto.randomUUID();

// Reusable "created at" column: unix timestamp, defaults to now.
const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

/** Brio's clients. One workspace per client. */
export const clients = sqliteTable("clients", {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

/** People who can log in. Admins are Brio staff; clients see one client only. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(newId),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["admin", "client"] })
    .notNull()
    .default("client"),
  // null for admins (they see every client).
  clientId: text("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  createdAt: createdAt(),
});

/** The four fixed sections created automatically for every client. */
export const sections = sqliteTable(
  "sections",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    key: text("key", {
      enum: ["vision", "roadmap", "field", "knowledge"],
    }).notNull(),
  },
  (t) => [index("sections_client_idx").on(t.clientId)]
);

/** Folders and files. A tree: parent_id = null means a section root item. */
export const nodes = sqliteTable(
  "nodes",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    sectionId: text("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    // null = top level of the section.
    parentId: text("parent_id"),
    kind: text("kind", { enum: ["folder", "file"] }).notNull(),
    name: text("name").notNull(),
    // File-only fields (null for folders).
    fileType: text("file_type"), // doc / sheet / design / demo ...
    mime: text("mime"),
    size: integer("size"),
    r2Key: text("r2_key"), // where the bytes live in Object Storage
    text: text("text"), // extracted text, for the agent to read
    isNew: integer("is_new", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("nodes_section_idx").on(t.sectionId),
    index("nodes_parent_idx").on(t.parentId),
  ]
);

/** Agent-generated observations ("What I'm noticing") per section. */
export const agentNotes = sqliteTable(
  "agent_notes",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    sectionId: text("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    nodeId: text("node_id").references(() => nodes.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["ask", "design"] })
      .notNull()
      .default("ask"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    severity: text("severity"), // e.g. "High"
    linkLabel: text("link_label"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_notes_section_idx").on(t.sectionId)]
);

/** One conversation per (user, client, section, mode). */
export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    sectionKey: text("section_key", {
      enum: ["vision", "roadmap", "field", "knowledge"],
    }).notNull(),
    mode: text("mode", { enum: ["ask", "design"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("chats_user_idx").on(t.userId)]
);

/** Messages inside a chat. */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_chat_idx").on(t.chatId)]
);

// Convenient TypeScript types inferred from the tables above.
export type Client = typeof clients.$inferSelect;
export type User = typeof users.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Node = typeof nodes.$inferSelect;
export type AgentNote = typeof agentNotes.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;
