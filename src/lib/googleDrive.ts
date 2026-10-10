/**
 * Minimal Google Drive OAuth + file access, via fetch (edge-compatible).
 * Reads use a short-lived access token obtained from the stored refresh token.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Full Drive scope so we can read existing folders AND write uploads back.
const SCOPE = "https://www.googleapis.com/auth/drive";

// Read credentials defensively — trim stray spaces/newlines from pasted values.
const clientId = () => (process.env.GOOGLE_CLIENT_ID ?? "").trim();
const clientSecret = () => (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();

export function driveConfigured(): boolean {
  return !!(clientId() && clientSecret());
}

/** The Google sign-in URL to start the connect flow. */
export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // so we receive a refresh token
    prompt: "consent", // force a refresh token every time
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchange the one-time code for tokens (includes a refresh token). */
export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

/** Get a fresh access token from a stored refresh token. */
export async function accessTokenFromRefresh(
  refreshToken: string
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export type DriveFile = {
  id: string;
  name: string;
  kind: "folder" | "file";
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
};

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** List the immediate children of a Drive folder. */
export async function listFolder(
  accessToken: string,
  folderId: string
): Promise<DriveFile[]> {
  const q = `'${folderId}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,mimeType,size,modifiedTime)",
    pageSize: "200",
    orderBy: "folder,name",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`);
  const data = (await res.json()) as {
    files: {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      modifiedTime?: string;
    }[];
  };
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.mimeType === FOLDER_MIME ? "folder" : "file",
    mimeType: f.mimeType,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime ?? null,
  }));
}

/** Pull the folder id out of a pasted Drive link (or accept a raw id). */
export function parseFolderId(input: string): string {
  const m = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}

const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDES = "application/vnd.google-apps.presentation";
const TEXTUAL_MIME = /^(text\/|application\/(json|xml|csv))/;

/** Fetch a Drive file's text, when it's a readable type. Returns null otherwise. */
export async function getFileText(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<string | null> {
  const auth = { Authorization: `Bearer ${accessToken}` };
  let url: string;
  if (mimeType === GOOGLE_DOC || mimeType === GOOGLE_SLIDES) {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
  } else if (mimeType === GOOGLE_SHEET) {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
  } else if (TEXTUAL_MIME.test(mimeType)) {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  } else {
    return null; // binary (PDF/Office/image) — not extracted in this version
  }
  const res = await fetch(url, { headers: auth });
  if (!res.ok) return null;
  return (await res.text()).slice(0, 20000);
}

/** Collect files (not folders) under a folder, recursively, up to `cap`. */
export async function collectFiles(
  accessToken: string,
  folderId: string,
  cap = 25
): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  const stack = [folderId];
  while (stack.length && out.length < cap) {
    const current = stack.pop()!;
    const children = await listFolder(accessToken, current);
    for (const c of children) {
      if (c.kind === "folder") stack.push(c.id);
      else if (out.length < cap) out.push(c);
    }
  }
  return out;
}
