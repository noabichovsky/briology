import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { BASE_PATH } from "@/lib/basePath";
import { buildAuthUrl, driveConfigured, parseFolderId } from "@/lib/googleDrive";

/** Start connecting the single "Briology" root Drive folder (admin only). */
export async function GET(request: NextRequest) {
  const user = await requireAdmin().catch((e) => e as Response);
  if (user instanceof Response) return user;

  const url = new URL(request.url);
  const folderRaw = url.searchParams.get("folder") ?? "";
  const origin = url.origin;
  const back = `${origin}${BASE_PATH}/`;

  if (!driveConfigured()) {
    return NextResponse.redirect(`${back}?drive=notconfigured`);
  }
  if (!folderRaw) {
    return NextResponse.redirect(`${back}?drive=missing`);
  }

  const folderId = parseFolderId(folderRaw);
  const redirectUri = `${origin}${BASE_PATH}/api/drive/callback`;
  return NextResponse.redirect(buildAuthUrl(redirectUri, folderId));
}
