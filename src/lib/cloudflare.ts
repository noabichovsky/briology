import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

/**
 * Minimal shapes of the Webflow Cloud bindings we use (declared in
 * wrangler.json). Kept local so the build never depends on generated
 * Cloudflare runtime type files.
 */
interface KVLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
  delete(key: string): Promise<void>;
}
interface R2ObjectLike {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}
interface R2Like {
  get(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}
interface Bindings {
  DB: unknown; // D1 database — handed to Drizzle below
  SESSIONS: KVLike; // Key-Value store for login sessions
  MEDIA: R2Like; // Object storage for uploaded files
  ASSETS: unknown;
}

/** Access Webflow Cloud's services (DB / SESSIONS / MEDIA). */
export function env(): Bindings {
  return getCloudflareContext().env as unknown as Bindings;
}

/** A ready-to-use database client, typed against our schema. */
export function getDb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return drizzle(env().DB as any, { schema });
}

export type Db = ReturnType<typeof getDb>;
