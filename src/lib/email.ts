/**
 * Send the magic-link email.
 *
 * Production: uses Resend (set EMAIL_API_KEY + EMAIL_FROM).
 * Development / no key: logs the link to the server console and returns it,
 * so you can sign in locally without setting up an email provider.
 */
export async function sendMagicLink(
  email: string,
  link: string
): Promise<{ delivered: boolean; devLink?: string }> {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Briology <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`\n[Briology] Magic link for ${email}:\n${link}\n`);
    return { delivered: false, devLink: link };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Your Briology sign-in link",
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">
        <p>Click to sign in to Briology:</p>
        <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:999px;text-decoration:none">Sign in</a></p>
        <p style="color:#777;font-size:13px">This link expires in 15 minutes. If you didn't request it, ignore this email.</p>
      </div>`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Email send failed (${res.status}): ${detail}`);
  }
  return { delivered: true };
}
