"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withBase } from "@/lib/basePath";
import {
  FolderIcon,
  FileIcon,
  ChevronIcon,
  SendIcon,
} from "@/components/icons";

type Item = {
  id: string;
  name: string;
  kind: "folder" | "file";
  mimeType: string;
  size: number | null;
};
type Msg = { role: "user" | "assistant"; text: string; error?: boolean };

export default function DriveApp({
  user,
}: {
  user: { email: string; role: "admin" | "client" };
}) {
  const isAdmin = user.role === "admin";

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [rootFolderId, setRootFolderId] = useState<string | null>(null);
  const [children, setChildren] = useState<Record<string, Item[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Record<string, Item>>({});
  const [treeError, setTreeError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [folderLink, setFolderLink] = useState("");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [live, setLive] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  // --- Load the root folder ---
  const loadRoot = useCallback(async () => {
    setLoading(true);
    setTreeError(null);
    try {
      const res = await fetch(withBase("/api/drive/list"));
      const data = (await res.json()) as {
        connected: boolean;
        folderId?: string;
        items?: Item[];
        error?: string;
      };
      setConnected(data.connected);
      if (data.error) setTreeError(data.error);
      if (data.connected && data.folderId) {
        setRootFolderId(data.folderId);
        setChildren({ [data.folderId]: data.items ?? [] });
      }
    } catch {
      setTreeError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, live, thinking]);

  // --- Lazy-load a folder's children when expanded ---
  async function toggleExpand(folder: Item) {
    const next = new Set(expanded);
    if (next.has(folder.id)) {
      next.delete(folder.id);
      setExpanded(next);
      return;
    }
    next.add(folder.id);
    setExpanded(next);
    if (!children[folder.id]) {
      const res = await fetch(withBase(`/api/drive/list?folder=${folder.id}`));
      if (res.ok) {
        const data = (await res.json()) as { items?: Item[] };
        setChildren((c) => ({ ...c, [folder.id]: data.items ?? [] }));
      }
    }
  }

  function toggleSelect(item: Item) {
    setSelected((s) => {
      const next = { ...s };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return next;
    });
  }

  function connect() {
    if (!folderLink.trim()) return;
    window.location.href = withBase(
      `/api/drive/connect?folder=${encodeURIComponent(folderLink.trim())}`
    );
  }

  // --- Agent ---
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || thinking) return;
    const sel = Object.values(selected).map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      mimeType: s.mimeType,
    }));
    setMessages((m) => [...m, { role: "user", text }]);
    setDraft("");
    setThinking(true);
    setLive("");
    try {
      const res = await fetch(withBase("/api/drive/agent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected: sel,
          message: text,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      if (!res.ok || !res.body) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessages((m) => [
          ...m,
          { role: "assistant", text: d?.error ?? "Something went wrong.", error: true },
        ]);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setLive(acc);
      }
      setMessages((m) => [...m, { role: "assistant", text: acc.trim() }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Error: " + (err instanceof Error ? err.message : String(err)), error: true },
      ]);
    } finally {
      setThinking(false);
      setLive("");
    }
  }

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
  }

  async function signOut() {
    await fetch(withBase("/api/auth/logout"), { method: "POST" });
    window.location.href = withBase("/login");
  }

  // --- Directory rendering (recursive, lazy) ---
  function renderLevel(folderId: string, depth: number): React.ReactNode {
    const items = children[folderId] ?? [];
    return items.map((item) => {
      const isSel = !!selected[item.id];
      const isOpen = expanded.has(item.id);
      return (
        <div key={item.id}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 8px",
              paddingLeft: 8 + depth * 16,
              borderRadius: 8,
              cursor: "pointer",
              background: isSel ? "var(--ink)" : "transparent",
              color: isSel ? "var(--bg)" : "var(--ink)",
              fontSize: 14.5,
            }}
          >
            {item.kind === "folder" ? (
              <button
                type="button"
                onClick={() => toggleExpand(item)}
                aria-label={isOpen ? "Collapse" : "Expand"}
                style={{
                  flex: "none",
                  width: 16,
                  height: 16,
                  border: 0,
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: isOpen ? "rotate(90deg)" : "none",
                  transition: "transform .12s",
                }}
              >
                <ChevronIcon />
              </button>
            ) : (
              <span style={{ width: 16, flex: "none" }} />
            )}
            <button
              type="button"
              onClick={() => toggleSelect(item)}
              title={item.name}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: 0,
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "inherit",
                padding: 0,
              }}
            >
              {item.kind === "folder" ? <FolderIcon /> : <FileIcon />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.name}
              </span>
            </button>
          </div>
          {item.kind === "folder" && isOpen && renderLevel(item.id, depth + 1)}
        </div>
      );
    });
  }

  const selectedList = Object.values(selected);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg)", color: "var(--ink)" }}>
      {/* Left: directory */}
      {sidebarOpen && (
        <aside
          style={{
            flex: "none",
            width: 320,
            maxWidth: "85vw",
            height: "100%",
            borderRight: "1px solid var(--line)",
            background: "var(--surface)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "16px 14px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.03em" }}>
              {isAdmin ? "Briology" : "Workspace"}
            </span>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Collapse sidebar" style={{ border: "1px solid var(--line)", borderRadius: 8, width: 30, height: 30, background: "transparent", cursor: "pointer" }}>
              ‹
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {loading && <p style={{ padding: 12, color: "var(--muted)", fontSize: 14 }}>Loading…</p>}

            {!loading && !connected && (
              isAdmin ? (
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
                    Connect your Briology Google Drive folder to see its contents here.
                  </p>
                  <input
                    placeholder="Paste the Drive folder link…"
                    value={folderLink}
                    onChange={(e) => setFolderLink(e.target.value)}
                    style={{ height: 38, padding: "0 12px", background: "var(--input)", border: "1px solid var(--input-line)", borderRadius: 10, color: "var(--ink)", fontSize: 14, outline: "none" }}
                  />
                  <button type="button" onClick={connect} disabled={!folderLink.trim()} style={{ height: 38, border: "1px solid var(--ink)", borderRadius: 999, background: "var(--ink)", color: "var(--bg)", cursor: folderLink.trim() ? "pointer" : "default", fontSize: 14, opacity: folderLink.trim() ? 1 : 0.5 }}>
                    Connect Google Drive
                  </button>
                </div>
              ) : (
                <p style={{ padding: 12, color: "var(--muted)", fontSize: 14 }}>No Drive folder connected yet.</p>
              )
            )}

            {!loading && connected && rootFolderId && renderLevel(rootFolderId, 0)}
            {treeError && <p style={{ padding: 12, color: "var(--risk)", fontSize: 13 }}>{treeError}</p>}
          </div>
        </aside>
      )}

      {/* Right: agent */}
      <div style={{ flex: "1 1 0", minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px clamp(16px,3vw,32px)", borderBottom: "1px solid var(--line)", background: "var(--navbg)", backdropFilter: "blur(10px)" }}>
          {!sidebarOpen && (
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar" style={{ border: "1px solid var(--line)", borderRadius: 8, width: 32, height: 32, background: "transparent", cursor: "pointer" }}>
              ☰
            </button>
          )}
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: "-0.02em" }}>Agent</h1>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" onClick={toggleTheme} style={{ border: "1px solid var(--pill)", borderRadius: 999, padding: "8px 16px", background: "transparent", cursor: "pointer", fontSize: 13 }}>
              Theme
            </button>
            <button type="button" onClick={signOut} style={{ border: "1px solid var(--pill)", borderRadius: 999, padding: "8px 16px", background: "transparent", cursor: "pointer", fontSize: 13 }}>
              Sign out
            </button>
          </div>
        </header>

        {/* Conversation */}
        <div ref={scrollerRef} style={{ flex: 1, overflowY: "auto", padding: "clamp(16px,3vw,40px)", display: "flex", flexDirection: "column", gap: 18 }}>
          {messages.length === 0 && !thinking && (
            <p style={{ margin: "auto", maxWidth: 420, textAlign: "center", color: "var(--muted)", fontSize: 15, lineHeight: 1.5 }}>
              Select a client, folder, or files on the left, then ask the agent about them.
            </p>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} style={{ alignSelf: "flex-end", maxWidth: "80%", padding: "10px 14px", borderRadius: "14px 14px 4px 14px", background: "var(--panel)", fontSize: 15, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                {m.text}
              </div>
            ) : (
              <div key={i} style={{ maxWidth: "80%", fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap", color: m.error ? "var(--risk)" : "var(--ink)" }}>
                {m.text}
              </div>
            )
          )}
          {thinking && (
            <div style={{ maxWidth: "80%", fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap", color: "var(--muted)" }}>
              {live || "Thinking…"}
            </div>
          )}
        </div>

        {/* Composer */}
        <form onSubmit={send} style={{ padding: "clamp(12px,2vw,20px) clamp(16px,3vw,40px)", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
          {selectedList.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedList.map((s) => (
                <span key={s.id} onClick={() => toggleSelect(s)} title="Click to remove" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "var(--panel)", fontSize: 12.5, cursor: "pointer" }}>
                  {s.name} ✕
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 10, background: "var(--input)", border: "1px solid var(--input-line)", borderRadius: 16 }}>
            <input
              aria-label="Message the agent"
              placeholder={selectedList.length ? `Ask about ${selectedList.length} selected item(s)…` : "Ask about the workspace…"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={thinking}
              style={{ flex: 1, minWidth: 0, height: 40, padding: "0 6px", border: 0, background: "transparent", outline: "none", font: "inherit", fontSize: 15, color: "var(--ink)" }}
            />
            <button type="submit" aria-label="Send" disabled={thinking} style={{ flex: "none", width: 38, height: 38, border: 0, borderRadius: 999, background: "var(--ink)", color: "var(--bg)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SendIcon />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
