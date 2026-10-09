import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, sessionCookie } from "@/lib/auth";
import { BASE_PATH } from "@/lib/basePath";

export async function POST(_request: NextRequest) {
  const token = (await cookies()).get(sessionCookie.name)?.value;
  if (token) await destroySession(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: BASE_PATH || "/",
    maxAge: 0,
  });
  return response;
}
