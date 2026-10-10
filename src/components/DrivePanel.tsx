"use client";

import { useCallback, useEffect, useState } from "react";
import { withBase } from "@/lib/basePath";
import { FolderIcon, FileIcon } from "@/components/icons";

type DriveFile = {
  id: string;
  name: string;
  kind: "folder" | "file";
  size: number | null;
};

type Props = { clientId: string; isAdmin: boolean };

export default function DrivePanel({ clientId, isAdmin }: Props) {
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [folderLink, setFolderLink] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withBase(`/api/drive/tree?client=${clientId}`));
      const data = (await res.json()) as {
        connected: boolean;
        files: DriveFile[];
        error?: string;
      };
      setConnected(data.connected);
      setFiles(data.files ?? []);
      if (data.error) setError(data.error);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  function connect() {
    if (!folderLink.trim()) return;
    window.location.href = withBase(
      `/api/drive/connect?client=${clientId}&folder=${encodeURIComponent(folderLink.trim())}`
    );
  }

  return (
    <div
      style={{
        marginTop: 24,
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
          Google Drive {connected ? "· connected" : ""}
        </span>
        {connected && (
          <button
            type="button"
            onClick={load}
            style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "5px 12px", background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      {/* Not connected: let an admin connect a folder */}
      {!loading && !connected && (
        isAdmin ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input
              placeholder="Paste the Google Drive folder link…"
              value={folderLink}
              onChange={(e) => setFolderLink(e.target.value)}
              style={{ flex: "1 1 280px", height: 40, padding: "0 12px", background: "var(--input)", border: "1px solid var(--input-line)", borderRadius: 10, color: "var(--ink)", fontSize: 14, outline: "none" }}
            />
            <button
              type="button"
              onClick={connect}
              disabled={!folderLink.trim()}
              style={{ height: 40, padding: "0 16px", border: "1px solid var(--ink)", borderRadius: 999, background: "var(--ink)", color: "var(--bg)", cursor: folderLink.trim() ? "pointer" : "default", fontSize: 14, opacity: folderLink.trim() ? 1 : 0.5 }}
            >
              Connect Google Drive
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
            No Google Drive folder connected yet.
          </p>
        )
      )}

      {/* Connected: show the folder's files */}
      {connected && !loading && files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {files.map((f) => (
            <div key={f.id} style={{ display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 10, alignItems: "center", padding: "6px 2px", fontSize: 15 }}>
              {f.kind === "folder" ? <FolderIcon /> : <FileIcon />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: "var(--muted)" }}>
                {f.kind === "folder" ? "folder" : f.size ? `${Math.max(1, Math.round(f.size / 1024))} KB` : "file"}
              </span>
            </div>
          ))}
        </div>
      )}
      {connected && !loading && files.length === 0 && !error && (
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
          Connected — but the folder looks empty (or nothing is shared yet).
        </p>
      )}

      {error && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--risk)" }}>{error}</p>
      )}
    </div>
  );
}
