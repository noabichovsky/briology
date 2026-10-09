"use client";

import { useState } from "react";
import { withBase } from "@/lib/basePath";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch(withBase("/api/auth/logout"), { method: "POST" });
    window.location.href = withBase("/login");
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      style={{
        border: "1px solid var(--pill)",
        borderRadius: 999,
        padding: "10px 20px",
        background: "transparent",
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
