# Briology — Plan & Roadmap

A plain-English record of what's built, what's next, and the decisions we've made.
Last updated: 2026-10-09.

---

## Where it is today (built & working)

A real client-workspace app, rebuilt from the design handoff:

- **Logins** by emailed magic link (no passwords). Two roles:
  - **Admin** (Brio) — sees and switches between every client.
  - **Client** — sees only their own workspace (enforced on the server, truly private).
- **The workspace** — four sections (Vision, Roadmap, Field, Knowledge), a Finder-style
  column browser, upload / new folder / rename / delete, search and sort.
- **The Claude agent** (right-hand panel):
  - **Ask** mode (Q&A across the client's content) and **Design opinion** mode.
  - Reads the client's whole workspace (structure + text of readable files),
    answers only from it, references files by name, streams live, and saves each
    conversation per section and mode.
  - Generates "What I'm noticing" observations per section (+ theme bars for Field).
- **Storage today:** Webflow Cloud's database (structure, chats, notes), file storage
  (uploads), and session store (logins). Each client's data is isolated.

Needs the admin's `ANTHROPIC_API_KEY` for the agent (already set locally).

---

## Next up (before/at go-live)

### Per-client pages
Each client gets its own web address, e.g. `brioid.com/briology/phytech`,
`brioid.com/briology/acme`. Bookmarkable, feels like "their space." Access control
still applies — a client opening another client's URL is refused.

### A way to add client users
Today only admins can sign in. Add an admin action to invite a client user (their
email) and attach them to a client workspace, so clients can log in to their own page.

### Deploy to Webflow Cloud
- App lives at a path on the Brio domain (e.g. `/briology`).
- Deploys from a GitHub repository.
- Webflow Cloud auto-provisions the database + file storage.
- Settings (admin emails, auth secret, Anthropic key, base path) entered in the
  Webflow dashboard.

---

## Phase 2 — Google Drive integration

Let content flow in from Google Drive instead of (or alongside) manual uploads.

**The model**
- **One environment = one client's workspace** (e.g. Phytech at `/briology/phytech`).
- **Each environment can connect to multiple Google Drives at once** — the client's own
  Drive, Brio's Drive, additional folders/accounts as needed.
- **One-way** sync: files flow **in** to Briology; Briology never writes back to anyone's
  Drive (originals are never touched).

**How connecting works**
- Each person (each client, and Brio) does a one-time **"Connect Google Drive"** — signs
  in with their own Google account.
- They use a **folder picker** to choose exactly which folder(s) to share. The app only
  ever sees the chosen folders — nothing else in their Drive. (More private, and keeps
  Google's app-review process light.)
- Each connection is a **labeled source** ("Phytech Drive", "Brio Drive"), and each
  maps its folder(s) to a **section** (Vision / Roadmap / Field / Knowledge).
- **Disconnecting** a source removes the files it brought in; the originals stay in Drive.

**To make Drive content useful to the agent**
- Add real **text extraction** for PDFs, Google Docs, Word, and Excel (today only plain
  text is read). This also improves the agent for normal uploads.

**Sync behavior (starting point)**
- **One-way** (Drive → Briology).
- **"Sync now" button + automatic refresh (e.g. hourly)** to start; near-real-time later
  if wanted.

**Heads-up — Google review**
Because external clients will grant Drive access, Google requires the app to be verified
before it can request that access. The folder-picker approach keeps this to the lightest
review tier. Plan for a short review lead time.

---

## Decisions made so far

| Topic | Decision |
|---|---|
| Client login | Magic link (passwordless) — recommended, keep unless changed |
| Per-client URLs | Yes — `/briology/<client>` |
| Drive connections | **Route B** — each client connects their own Drive; Brio connects their own too |
| Drives per environment | **Multiple** allowed per client workspace |
| Sync direction | **One-way** (Drive → Briology) to start |
| Drive access scope | **Folder picker** — only chosen folders, not whole Drive |
| Structure/chats/notes | Stay in Webflow Cloud's database (not Drive) |

## Open questions
- Sync freshness: confirm "Sync now" + hourly as the starting point.
- Who can connect a client's Drive — the client themselves, the admin, or either?
- What happens to agent chat history if a synced file is later removed in Drive.
