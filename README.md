# Briology

Brio's shared client workspace with a Claude-powered agent, built for **Webflow Cloud**
(Next.js 15 + Cloudflare Workers, D1 database, R2 file storage, KV sessions).

This is the real app rebuilt from the design handoff in `design_handoff_briology/`.

---

## Run it on your computer

```bash
npm install          # one time — downloads the tools
npm run db:migrate:local   # one time — creates the local database tables
npm run dev          # starts the app at http://localhost:3000
```

Open http://localhost:3000, enter an email that's listed in `ADMIN_EMAILS`
(see `.env.local` — yours is already set), and click the sign-in link it shows.
No email provider is needed locally — the magic link is printed on screen and in
the terminal.

Stop the server with `Ctrl+C`. **Don't run `npm run build` while `npm run dev`
is running** — they share a build folder and will conflict.

---

## Settings (environment variables)

Local settings live in `.env.local` (not shared). In production they go in
**Webflow Cloud → your project → Environment → Environment variables**.
See `.env.example` for the full list. The important ones:

| Name | What it's for | Secret? |
|---|---|---|
| `ADMIN_EMAILS` | Comma-separated Brio emails that become admins | no |
| `AUTH_SECRET` | Random 32+ char string that secures logins | **yes** |
| `ANTHROPIC_API_KEY` | Powers the Claude agent and observations | **yes** |
| `EMAIL_API_KEY` / `EMAIL_FROM` | Sends real magic-link emails (Resend) | **yes** |
| `NEXT_PUBLIC_BASE_PATH` | The mount path, e.g. `/briology` (empty locally) | no |

**To use the agent**, add your Anthropic key to `.env.local`:
`ANTHROPIC_API_KEY=sk-ant-...` then restart `npm run dev`. Without it, the app
works fully except the agent, which shows a friendly "not configured" message.

---

## Deploy to Webflow Cloud

1. In your Webflow dashboard, create the Briology project and set its mount path
   (e.g. `/briology`). Webflow Cloud provisions the database, file storage, and
   session store automatically from `wrangler.json`.
2. Add the environment variables above (set `NEXT_PUBLIC_BASE_PATH` to your mount
   path).
3. Deploy:
   ```bash
   npx webflow cloud deploy
   ```
4. Apply the database tables to the live database once:
   ```bash
   npm run db:migrate:remote
   ```

---

## How it's organized

- `src/app/` — pages (`/` workspace, `/login`) and API routes (`/api/*`)
- `src/components/` — the screen: `Workspace`, `AgentPanel`, `Observations`, icons
- `src/db/schema.ts` — the database blueprint (clients, users, sections, files, chats…)
- `src/lib/` — shared logic: `auth`, `data`, `agentContext`, Cloudflare bindings
- `drizzle/` — database migrations
- `wrangler.json` — Webflow Cloud service bindings (DB / SESSIONS / MEDIA)

---

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally at http://localhost:3000 |
| `npm run build` | Check the whole app compiles (stop `dev` first) |
| `npm run db:generate` | Regenerate migrations after editing `schema.ts` |
| `npm run db:migrate:local` | Apply tables to the local database |
| `npm run cf:preview` | Preview the real Cloudflare Workers build locally |
| `npm run cf:deploy` | Build + deploy the Workers bundle |
