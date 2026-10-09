import { NextRequest, NextResponse } from "next/server";
import {
  consumeMagicToken,
  resolveUserForEmail,
  createSession,
  sessionCookie,
} from "@/lib/auth";
import { BASE_PATH } from "@/lib/basePath";

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  const origin = new URL(request.url).origin;
  const loginUrl = `${origin}${BASE_PATH}/login`;
  const homeUrl = `${origin}${BASE_PATH}/`;

  if (!token) {
    return NextResponse.redirect(`${loginUrl}?error=missing`);
  }

  const email = await consumeMagicToken(token);
  if (!email) {
    return NextResponse.redirect(`${loginUrl}?error=expired`);
  }

  const user = await resolveUserForEmail(email);
  if (!user) {
    return NextResponse.redirect(`${loginUrl}?error=noaccess`);
  }

  const session = await createSession(user.id);
  const response = NextResponse.redirect(homeUrl);
  response.cookies.set(sessionCookie.name, session, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: BASE_PATH || "/",
    maxAge: sessionCookie.maxAge,
  });
  return response;
}
