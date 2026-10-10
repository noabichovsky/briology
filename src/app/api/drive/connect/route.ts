import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { assertClientAccess } from "@/lib/data";
import { BASE_PATH } from "@/lib/basePath";
import { buildAuthUrl, driveConfigured, parseFolderId } from "@/lib/googleDrive";

/** Start the Google Drive connect flow: redirect the admin to Google sign-in. */
export async function GET(request: NextRequest) {
  const user = await requireAdmin().catch((e) => e as Response);
  if (user instanceof Response) return user;

  const url = new URL(request.url);
  const clientId = url.searchParams.get("client") ?? "";
  const folderRaw = url.searchParams.get("folder") ?? "";
  const origin = url.origin;
  const back = `${origin}${BASE_PATH}/`;

  if (!driveConfigured()) {
    return NextResponse.redirect(`${back}?drive=notconfigured`);
  }
  if (!clientId || !folderRaw) {
    return NextResponse.redirect(`${back}?drive=missing`);
  }
  try {
    assertClientAccess(user, clientId);
  } catch {
    return NextResponse.redirect(`${back}?drive=forbidden`);
  }

  const folderId = parseFolderId(folderRaw);
  const redirectUri = `${origin}${BASE_PATH}/api/drive/callback`;
  const state = `${clientId}|${folderId}`;
  return NextResponse.redirect(buildAuthUrl(redirectUri, state));
}
