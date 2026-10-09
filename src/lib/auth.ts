import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { env, getDb } from "@/lib/cloudflare";
import { users, type User } from "@/db/schema";

const SESSION_COOKIE = "briology_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAGIC_TTL_SECONDS = 60 * 15; // 15 minutes

/** A random, URL-safe token. */
function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- Magic links -----------------------------------------------------------

/** Create a one-time magic-link token tied to an email. */
export async function createMagicToken(email: string): Promise<string> {
  const token = randomToken();
  await env().SESSIONS.put(`magic:${token}`, email.toLowerCase().trim(), {
    expirationTtl: MAGIC_TTL_SECONDS,
  });
  return token;
}

/** Consume a magic token, returning the email it was issued for (one-time). */
export async function consumeMagicToken(token: string): Promise<string | null> {
  const key = `magic:${token}`;
  const email = await env().SESSIONS.get(key);
  if (email) await env().SESSIONS.delete(key); // single use
  return email;
}

// ---- Sessions --------------------------------------------------------------

/** Create a session for a user and return the opaque session token. */
export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  await env().SESSIONS.put(`session:${token}`, userId, {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await env().SESSIONS.delete(`session:${token}`);
}

/** The name/attributes of the session cookie. */
export const sessionCookie = {
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SECONDS,
};

/** Look up the signed-in user from the request cookie, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await env().SESSIONS.get(`session:${token}`);
  if (!userId) return null;
  const db = getDb();
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return row ?? null;
}

/** Throw-style guard for server code that requires a signed-in user. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Response("Forbidden", { status: 403 });
  return user;
}

// ---- Admin seeding ---------------------------------------------------------

/** Is this email on the Brio admin allow-list? */
export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  return list.includes(email.toLowerCase().trim());
}

/**
 * Find or create the user for a verified email.
 * - Emails on ADMIN_EMAILS become (or stay) admins.
 * - Existing users log in with their stored role/client.
 * - Unknown non-admin emails are rejected (Brio must add them first).
 */
export async function resolveUserForEmail(
  email: string
): Promise<User | null> {
  const normalized = email.toLowerCase().trim();
  const db = getDb();
  const existing = await db.query.users.findFirst({
    where: eq(users.email, normalized),
  });

  if (isAdminEmail(normalized)) {
    if (existing) {
      if (existing.role !== "admin") {
        await db
          .update(users)
          .set({ role: "admin", clientId: null })
          .where(eq(users.id, existing.id));
        return { ...existing, role: "admin", clientId: null };
      }
      return existing;
    }
    const [created] = await db
      .insert(users)
      .values({ email: normalized, role: "admin", clientId: null })
      .returning();
    return created;
  }

  // Non-admin: only pre-provisioned client users may sign in.
  return existing ?? null;
}
