import { NextRequest, NextResponse } from "next/server";
import { createMagicToken, resolveUserForEmail } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";
import { BASE_PATH } from "@/lib/basePath";

export async function POST(request: NextRequest) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = (body.email ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  // Only send a link to emails that are allowed to sign in.
  const user = await resolveUserForEmail(email);
  if (!user) {
    // Don't reveal whether an email exists; respond the same either way.
    return NextResponse.json({ ok: true, delivered: true });
  }

  const token = await createMagicToken(email);
  const origin = new URL(request.url).origin;
  const link = `${origin}${BASE_PATH}/api/auth/callback?token=${token}`;

  const result = await sendMagicLink(email, link);
  return NextResponse.json({
    ok: true,
    delivered: result.delivered,
    // Present only in development (no email provider configured).
    devLink: result.devLink,
  });
}
