import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

/**
 * Access Webflow Cloud's services (the "bindings" declared in wrangler.json):
 *  - DB:       the SQLite database (D1)
 *  - SESSIONS: the Key-Value store for login sessions
 *  - MEDIA:    the Object Storage bucket for uploaded files
 * Plus environment variables (API keys, admin emails, etc.).
 */
export function env() {
  return getCloudflareContext().env;
}

/** A ready-to-use database client, typed against our schema. */
export function getDb() {
  return drizzle(env().DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
