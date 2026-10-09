/**
 * The mount path Webflow Cloud serves the app under (e.g. "/briology").
 *
 * Rule from the handoff spec:
 *  - <Link>, router, and next/image handle the base path automatically.
 *  - Plain client-side fetch() and <img src> do NOT — prefix them with this.
 *  - Never import next.config to read it; use this env var.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix an app-relative path (e.g. "/api/tree") with the mount path. */
export function withBase(path: string): string {
  if (!path.startsWith("/")) return path; // leave absolute URLs alone
  return BASE_PATH + path;
}
