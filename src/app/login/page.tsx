"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { withBase } from "@/lib/basePath";

const ERRORS: Record<string, string> = {
  missing: "That sign-in link was incomplete. Please request a new one.",
  expired: "That link expired or was already used. Request a new one.",
  noaccess:
    "This email doesn't have access yet. Ask Brio to add you to a workspace.",
};

function LoginForm() {
  const params = useSearchParams();
  const urlError = params.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string>(
    urlError ? ERRORS[urlError] ?? "Something went wrong." : ""
  );
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    setMessage("");
    setDevLink(null);
    try {
      const res = await fetch(withBase("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        error?: string;
        devLink?: string;
      };
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Could not send the link.");
        return;
      }
      setStatus("sent");
      setMessage("Check your email for a sign-in link.");
      if (data.devLink) setDevLink(data.devLink);
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={withBase("/brio-logo.svg")}
          alt="Brio"
          style={{ height: 34, width: "auto", alignSelf: "flex-start" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 400,
              letterSpacing: "-0.035em",
            }}
          >
            Sign in to Briology
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 15 }}>
            We'll email you a secure link.
          </p>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            autoFocus
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "sending"}
            style={{
              height: 46,
              padding: "0 14px",
              background: "var(--input)",
              border: "1px solid var(--input-line)",
              borderRadius: 12,
              color: "var(--ink)",
              fontSize: 15,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={status === "sending"}
            style={{
              height: 46,
              border: "1px solid var(--ink)",
              borderRadius: 999,
              background: "var(--ink)",
              color: "var(--bg)",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {status === "sending" ? "Sending…" : "Email me a link"}
          </button>
        </form>

        {message && (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: status === "error" ? "var(--risk)" : "var(--muted)",
            }}
          >
            {message}
          </p>
        )}

        {devLink && (
          <div
            style={{
              fontSize: 13,
              color: "var(--muted)",
              background: "var(--panel)",
              borderRadius: 10,
              padding: "12px 14px",
              wordBreak: "break-all",
            }}
          >
            Dev mode — no email provider set. Click to sign in:
            <br />
            <a href={devLink} style={{ textDecoration: "underline" }}>
              {devLink}
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
