# Handoff: Briology — client workspace with a Claude agent

## Overview
Briology is Brio's (product design studio) shared workspace with each client. For every client it holds four sections — **Vision, Roadmap, Field, Knowledge** — each a folder/file hierarchy. A right-hand **Agent** panel, powered by Claude, answers questions about the workspace content (**Ask** mode) or gives a senior-designer critique (**Design opinion** mode).

Content changes constantly and is entered by hand by Brio (create folders, upload files, write notes). Nothing is hard-coded in production; the sample data in the prototype is illustrative only.

## About the Design Files
`Briology v1.1.dc.html` is a **design reference built in HTML** — a working prototype showing intended look and behaviour, not production code. Recreate it in a real app. No codebase exists yet; the recommended stack is below. Open the HTML file in a browser (keep `support.js` and `brio-logo.svg` beside it) to try every interaction. In the prototype the agent calls Claude through a sandbox helper (`window.claude.complete`); in production this must be a server-side call to the Anthropic API.

## Fidelity
**High-fidelity.** Colours, type, spacing and interactions are final. Recreate pixel-accurately.

---

## Target platform: Webflow Cloud (Brio hosts everything on Webflow)

| Layer | Choice | Notes |
|---|---|---|
| App | **Next.js 15+** (App Router, TypeScript), **npm only** | Webflow Cloud detects Next.js from package.json and wires the Cloudflare adapter itself. Do NOT set basePath/assetPrefix — the platform sets them from the mount path (e.g. `/briology`) |
| Runtime | Cloudflare Workers (edge) | Use `fetch`; avoid Node-only libs. Add `export const runtime = 'edge'` to API routes |
| Database | Webflow Cloud **SQLite** (D1), binding `DB` | Drizzle ORM + migrations in `drizzle/` |
| Files | Webflow Cloud **Object Storage** (R2), binding `MEDIA` | Uploaded files |
| Sessions | Webflow Cloud **Key Value Store** (KV), binding `SESSIONS` | Login sessions |
| Auth | Email magic-link (own implementation on KV, or Auth.js / Clerk if edge-compatible) | Roles: `admin` (Brio) and `client` |
| LLM | Anthropic Messages API via `fetch` to `https://api.anthropic.com/v1/messages` | Secret env var `ANTHROPIC_API_KEY`; stream with SSE |

Access bindings in Next.js through `getCloudflareContext().env` (from `@opennextjs/cloudflare`). Env vars via `process.env`.

**Base path:** set env var `NEXT_PUBLIC_BASE_PATH` = mount path (e.g. `/briology`) and prefix every client-side `fetch` and plain `<img src>` with it. `<Link>`, `router`, `next/image` handle it automatically. Never import `next.config` to read it.

Commit this `wrangler.json` (IDs are placeholders; Webflow Cloud provisions real ones):
```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "briology",
  "compatibility_date": "2025-04-15",
  "d1_databases": [{ "binding": "DB", "database_name": "briology", "database_id": "0", "migrations_dir": "drizzle" }],
  "kv_namespaces": [{ "binding": "SESSIONS", "id": "local" }],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "briology-media" }]
}
```
Optional `webflow.json`: `{ "cloud": { "framework": "nextjs" } }`.

### Data model (SQLite)
```
clients        id, name, created_at
users          id, email, role ('admin'|'client'), client_id (null for admins), created_at
sessions       (KV) token -> user_id, expires
sections       id, client_id, key ('vision'|'roadmap'|'field'|'knowledge')   -- 4 rows auto-created per client
nodes          id, section_id, parent_id (null = root), kind ('folder'|'file'), name,
               file_type, mime, size, r2_key, text (extracted), is_new, created_by, created_at, updated_at
agent_notes    id, section_id, node_id (nullable), mode ('ask'|'design'), title, body, severity, link_label, created_at
chats          id, user_id, client_id, section_key, mode, created_at
messages       id, chat_id, role ('user'|'assistant'), content, created_at
```
Every query is scoped server-side: admins see all clients; client users only their `client_id`.

### API routes (all under the mount path)
- `POST /api/auth/login` (send magic link) · `GET /api/auth/callback` · `POST /api/auth/logout`
- `GET /api/clients` · `POST /api/clients` · `DELETE /api/clients/:id` (admin only; delete cascades nodes, R2 objects, chats)
- `GET /api/tree?client=&section=` — nested nodes
- `POST /api/nodes` — folder `{section_id,parent_id,name}` or multipart file upload → R2 + extract text (txt/md/csv/json/html directly; PDF text via Claude or a WASM parser)
- `PATCH /api/nodes/:id` (rename/move) · `DELETE /api/nodes/:id` (recursive, removes R2 objects)
- `GET /api/files/:id` — stream file from R2
- `POST /api/agent` — `{client_id, section_key, mode, selected_node_id?, chat_id?, message}` → SSE stream; persists messages

### Agent request (server)
1. Load the client's workspace: all sections → outline (`[Type] name (meta) [new]`) + agent notes + extracted `text` (truncate ~20k chars/file).
2. Put it in `system` with `cache_control: {type:"ephemeral"}` (prompt caching).
3. If the selected file is a PDF or image, fetch from R2 and attach as a base64 `document`/`image` block on the user turn.
4. Send history + message with `stream: true`; pipe the SSE back to the browser.
5. When content outgrows context, add retrieval (Cloudflare Vectorize or embeddings stored in SQLite).

System prompt (from the prototype — keep verbatim):
> You are the Briology agent for Brio, a product design studio. Briology is the workspace where Brio and its client {CLIENT} keep the product's vision, roadmap, field feedback and knowledge for the product. Answer using only the workspace content below; if something is not in it, say so. Reference files by name. Write plain text, no markdown, no headings. Be concise: a few short sentences or a short list using "- ".

Ask suffix: "You answer questions about the content, connect related items across sections, and point out gaps or conflicts."
Design opinion suffix: "You are acting as a senior product designer giving a design opinion. Judge against the vision pillars, field feedback and design principles in the workspace. Say what works, what does not, and what to try next, specifically."

### Environment variables (Webflow Cloud → environment → Environment variables)
- `ANTHROPIC_API_KEY` — **Secret**
- `AUTH_SECRET` — **Secret** (random 32+ chars, signs session tokens)
- `EMAIL_API_KEY` — **Secret** (e.g. Resend, for magic links)
- `NEXT_PUBLIC_BASE_PATH` — e.g. `/briology`
- `ADMIN_EMAILS` — comma-separated Brio admin emails (seeded as admins on first login)

---

## Screens / Views

Single screen. Root: `display:flex; height:100vh; overflow:hidden`. Left = scrollable workspace (`flex:1 1 0; overflow-y:auto`). Right = agent panel (only when open).

### 1. Header (sticky, inside the left scroller)
- `position:sticky; top:0; z-index:20; display:flex; flex-wrap:wrap; align-items:center; gap:12px 24px; padding:22px clamp(20px,3vw,40px); background:var(--navbg); backdrop-filter:blur(10px)`
- **Left group** (`flex:1 1 0; min-width:max-content`): client name, Geist 20px / 500 / letter-spacing −0.03em.
  - Admin: the name is a button (`padding:6px 12px; margin-left:-12px; border-radius:999px`). Hover → `background:var(--hover)` and opens the dropdown (also opens on click; stays highlighted while open). Dropdown: `position:absolute; top:100%; left:-12px; padding-top:8px`; card `min-width:240px; padding:8px; background:var(--surface); border:1px solid var(--line); border-radius:14px; box-shadow:0 12px 32px rgba(0,0,0,.08)`. Options: 15px, `padding:10px 12px; border-radius:10px`; current option `background:var(--panel)` + 14px check icon on the right. Closes on mouse leave or selection. Switching client reloads the whole workspace.
  - Client role: plain text, no dropdown.
- **Centre nav** (`flex:0 1 auto; justify-content:center; gap:4px; flex-wrap:wrap`): four pill buttons — Vision, Roadmap, Field, Knowledge. Each `padding:9px 16px; border-radius:999px; font-size:16px; gap:10px`, an 8px colour dot first. Active: `border:1px solid var(--pill)`; inactive border transparent. Hover `background:var(--hover)`.
- **Right group** (`flex:1 1 0; min-width:max-content; justify-content:flex-end; gap:10px`):
  - "Switch theme" — outline pill `border:1px solid var(--pill); padding:10px 20px; 14px`.
  - "Agent" (only when panel closed) — filled pill `background:var(--ink); color:var(--bg); padding:10px 20px; 14px`, 7px dot in current section colour.

### 2. Workspace (left)
Container padding `clamp(28px,5vw,64px) clamp(20px,3vw,40px) 72px`.
- **Section title** h1: Geist 300, `font-size:clamp(48px,7vw,104px); line-height:.95; letter-spacing:-0.05em`.
- **Toolbar** (`margin:clamp(32px,5vw,56px) 0 16px; flex; wrap; space-between; gap:12px`):
  - Search field: `flex:1 1 260px; max-width:420px; height:42px; padding:0 14px; background:var(--input); border:1px solid var(--input-line); border-radius:12px`, 15px magnifier icon, placeholder "Search {section}".
  - Sort group: `border:1px solid var(--line); border-radius:999px; padding:3px 3px 3px 12px`; label "SORT" (Geist Mono 11px, uppercase, .06em, muted); pills "Name" / "New" (`padding:6px 12px; 13px`), active `background:var(--ink); color:var(--bg)`.
  - "New folder" — outline pill, `height:38px; padding:0 16px; 14px`, folder icon + label.
- **Column browser** (Finder-style): `display:flex; height:clamp(360px,calc(100vh - 340px),760px); border-top & border-bottom:1px solid var(--line); overflow-x:auto`.
  - Column 1 = section root; each opened folder adds a column. Column: `flex:0 0 280px; border-right:1px solid var(--line); overflow-y:auto; padding:8px; gap:1px`.
  - Row: grid `18px 1fr auto; gap:10px; padding:9px 10px (compact: 6px 10px); border-radius:8px; font-size:15px; letter-spacing:-0.01em`; ellipsis on name. Icons: 18px outline folder / file (stroke 1.3, currentColor). Right side: 7px red "new" dot (folders show it if anything inside is new), 10px chevron for folders.
  - States: deepest active item `background:var(--ink); color:var(--bg)`; ancestor folders in the open path `background:var(--panel)`; hover `box-shadow:inset 0 0 0 100px var(--hover)` (overlay, so it works on both).
  - Empty folder column: "Empty folder", 14px muted, padding 20px 10px.
  - **Preview column** (when a file is selected): `flex:1 0 300px; padding:28px; gap:12px` — type tag (Mono 11px uppercase muted) + red "New" if new; title `clamp(22px,2.2vw,30px)/1.15, 400, −0.035em`; meta 14.5px muted; outline pill "Ask the agent about this" (opens panel; hidden when panel is open).
  - Auto-scroll the browser to the far right whenever the path/selection changes.
- **Search results** (replaces columns while query non-empty): list rows `padding:14px 12px; border-bottom:1px solid var(--line)`; icon, name 16px, path line Geist Mono 11.5px muted ("All files / Personas"), new dot. Click → clears search and opens that item in the columns. Empty: `No matches for "{q}"`.
- Sorting: folders always first. Name = A–Z (ignore leading quotes/#). New = items with `is_new` (or folders containing new) first, then original order.

### 3. Agent panel (right)
- `flex:none; width:420px default; max-width:85vw; height:100%; background:var(--surface); border-left:1px solid var(--line)`.
- **Resize**: 9px invisible handle on the left edge (`cursor:col-resize`), drag sets width = `window.innerWidth − pointerX`, clamped 320px…85vw. Disable text selection while dragging.
- Inner scroller: `padding:clamp(22px,2.4vw,32px); flex column; gap:24px`.
- Header row: title (26px / 400 / −0.035em) = "Agent" or "Design opinion" by mode; right: "New chat" outline pill (only when a conversation exists) + 40px round ✕ close (`border:1px solid var(--line)`).
- **"Looking at" card** (when a file is selected): `background:var(--panel); border-radius:10px; padding:18px 20px`; label "LOOKING AT" Mono 11px with section-colour dot; title 18px/500; bullet notes 14.5px.
- **Observations** (shown when no conversation): heading Mono 11px uppercase muted ("What I'm noticing" / "Across {section}"); Field shows theme bars (label, count, 4px bar filled `--field`, width = n/max); items separated by `border-top:1px solid var(--line); padding-top:16px` — title 15.5px/500, body 14.5px/1.5, optional severity prefix (High in `--risk`, 500), link label Mono 11.5px muted.
- **Conversation** (replaces observations): user bubble right-aligned `max-width:85%; padding:10px 14px; border-radius:14px 14px 4px 14px; background:var(--panel); 15px`; agent reply left with Mono 11px label (mode title) above, 15px/1.55, `white-space:pre-wrap`; errors in `--risk`. "Thinking…" Mono 12px muted while waiting (replace with streaming text in production). Auto-scroll to bottom.
- **Composer** (sticky bottom): `padding:10px; background:var(--input); border:1px solid var(--input-line); border-radius:16px`; text input 15px borderless `height:44px`; bottom row: mode chips **Ask** / **Design opinion** (`padding:7px 12px; 13px; border-radius:999px`, active filled ink, inactive `border:1px solid var(--line)`), and a 38px round send button (ink bg, up-arrow icon). Placeholders: Ask → "Ask about {section}…", Design → "What should I review? e.g. prototype v0.4". Enter submits; disabled while thinking.
- Each section × mode keeps its own conversation.

## State
`clientId, sectionKey, trail (open folder ids), selectedNodeId, query, sort ('name'|'new'), editingFolderId, panelOpen, panelWidth, mode ('ask'|'design'), chats[section:mode], draft, thinking, theme ('auto'|'light'|'dark'), clientMenuOpen`. Section change resets trail/selection/query/editing.

**New folder flow**: insert "Untitled folder" into the deepest open column with an inline input (autofocus, text selected, `border:1px solid var(--ink); border-radius:6px; padding:5px 8px`). Enter / Esc / blur commits (empty → "Untitled folder"), persists via `POST /api/nodes`, then opens the new folder.

## Design Tokens
Fonts: **Geist** 300/400/500 (UI, display) and **Geist Mono** 400 (labels, meta). Google Fonts.

| Token | Light | Dark |
|---|---|---|
| --bg | #fafaf8 | #111111 |
| --surface | #ffffff | #1a1a19 |
| --panel | #f1f1ee | #242422 |
| --ink | #111111 | #fafaf8 |
| --muted | #777777 | #9a9a94 |
| --line | #e4e4e0 | rgba(255,255,255,.10) |
| --hover | rgba(0,0,0,.035) | rgba(255,255,255,.04) |
| --navbg | rgba(250,250,248,.82) | rgba(17,17,17,.82) |
| --pill | rgba(0,0,0,.25) | rgba(255,255,255,.30) |
| --input | #f4f4f4 | #242422 |
| --input-line | #ebebeb | rgba(255,255,255,.08) |
| --risk | #E5484D | #F0696B |

Section colours: Vision #EFD24A · Roadmap #FFB500 · Field #FB8ED7 · Knowledge #2d9e75.
Radii: 999px (pills), 16px (composer), 14px (inputs/menus), 12px (search), 10px (cards), 8px (rows), 6px (inline input).
Theme: follows `prefers-color-scheme` until toggled; toggle sets `data-theme` on `<html>`.
Focus: `outline:2px solid var(--ink); outline-offset:2px`. Respect `prefers-reduced-motion`.

## Assets
- `brio-logo.svg` — Brio wordmark (from Brio.html; currently not shown in the UI, kept for login/branding).
- Icons are simple inline outline SVGs (folder, file, search, chevron, check, send arrow) — swap for the codebase's icon set (e.g. Lucide) at the same 18px / 1.3 stroke.

## Files
- `Briology v1.2.dc.html` — the prototype (empty workspace, upload/new folder/delete, client add/delete, column browser, search/sort, Claude agent incl. `context()` and `ask()`).
- `support.js` — runtime needed to open the prototype locally.
- `brio-logo.svg`.

## Suggested build order
1. Next.js app + wrangler.json bindings + Drizzle schema/migrations. Deploy an empty shell to Webflow Cloud first to confirm the mount path works.
2. Magic-link auth, roles, admin seeding from ADMIN_EMAILS.
3. Header (client switcher with add/delete), section nav, column browser from DB.
4. Upload to R2, new folder, rename, delete (with confirm), search, sort.
5. /api/agent with streaming + prompt caching + chat persistence; PDF/image blocks.
6. Generated "What I'm noticing" notes per section.
