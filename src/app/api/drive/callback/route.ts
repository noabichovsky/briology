import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setDriveRoot } from "@/lib/data";
import { BASE_PATH } from "@/lib/basePath";
import { exchangeCode } from "@/lib/googleDrive";

/** Google redirects here after the admin approves. Store the root connection. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const back = `${origin}${BASE_PATH}/`;

  const user = await requireAdmin().catch((e) => e as Response);
  if (user instanceof Response) return user;

  const code = url.searchParams.get("code");
  const folderId = url.searchParams.get("state") ?? "";
  if (!code || !folderId) {
    return NextResponse.redirect(`${back}?drive=failed`);
  }

  try {
    const redirectUri = `${origin}${BASE_PATH}/api/drive/callback`;
    const tokens = await exchangeCode(code, redirectUri);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${back}?drive=noretoken`);
    }
    await setDriveRoot(folderId, tokens.refresh_token, user.id);
    return NextResponse.redirect(`${back}?drive=connected`);
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(`${back}?drive=error`);
  }
}
