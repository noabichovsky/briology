"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withBase } from "@/lib/basePath";
import { sectionColor, sectionName, type SectionKey } from "@/lib/sections";
import type { AgentMode, ChatMessage, TreeNode } from "@/lib/types";
import { SendIcon } from "@/components/icons";
import Observations from "@/components/Observations";

type Props = {
  width: number;
  onWidth: (w: number) => void;
  onClose: () => void;
  section: SectionKey;
  selectedFile: TreeNode | null;
  clientId: string | null;
};

const MODE_TITLE: Record<AgentMode, string> = {
  ask: "Agent",
  design: "Design opinion",
};

export default function AgentPanel({
  width,
  onWidth,
  onClose,
  section,
  selectedFile,
  clientId,
}: Props) {
  const [mode, setMode] = useState<AgentMode>("ask");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [live, setLive] = useState(""); // streaming assistant text

  const scrollerRef = useRef<HTMLDivElement>(null);

  // --- Resize handle ---
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const move = (ev: PointerEvent) =>
      onWidth(
        Math.max(320, Math.min(window.innerWidth * 0.85, window.innerWidth - ev.clientX))
      );
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // --- Load the conversation for this client/section/mode ---
  const loadChat = useCallback(async () => {
    if (!clientId) {
      setMessages([]);
      return;
    }
    const res = await fetch(
      withBase(`/api/chat?client=${clientId}&section=${section}&mode=${mode}`)
    );
    if (res.ok) {
      const data = (await res.json()) as {
        messages: { role: "user" | "assistant"; content: string }[];
      };
      setMessages(data.messages.map((m) => ({ role: m.role, text: m.content })));
    }
  }, [clientId, section, mode]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  // Auto-scroll to the bottom as the conversation grows.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, live, thinking]);

  // --- Send a message & stream the reply ---
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || thinking || !clientId) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setDraft("");
    setThinking(true);
    setLive("");

    try {
      const res = await fetch(withBase("/api/agent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          section_key: section,
          mode,
          selected_node_id: selectedFile?.id ?? null,
          message: text,
        }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: data?.error ?? "Something went wrong.",
            error: true,
          },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setLive(acc);
      }
      setMessages((m) => [...m, { role: "assistant", text: acc.trim() }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text:
            "Something went wrong: " +
            (err instanceof Error ? err.message : String(err)),
          error: true,
        },
      ]);
    } finally {
      setThinking(false);
      setLive("");
    }
  }

  async function newChat() {
    if (!clientId) return;
    await fetch(
      withBase(`/api/chat?client=${clientId}&section=${section}&mode=${mode}`),
      { method: "DELETE" }
    );
    setMessages([]);
  }

  const hasThread = messages.length > 0 || thinking;
  const placeholder =
    mode === "ask"
      ? `Ask about ${sectionName(section).toLowerCase()}…`
      : "What should I review? e.g. prototype v0.4";

  return (
    <aside
      aria-label="Agent"
      style={{
        position: "relative",
        flex: "none",
        width,
        maxWidth: "85vw",
        height: "100%",
        background: "var(--surface)",
        borderLeft: "1px solid var(--line)",
      }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize agent panel"
        title="Drag to resize"
        onPointerDown={startResize}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: -4,
          width: 9,
          cursor: "col-resize",
          zIndex: 2,
        }}
      />
      <div
        ref={scrollerRef}
        style={{
          height: "100%",
          overflowY: "auto",
          padding: "clamp(22px,2.4vw,32px)",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 26, lineHeight: 1.1, fontWeight: 400, letterSpacing: "-0.035em" }}>
            {MODE_TITLE[mode]}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasThread && (
              <button
                type="button"
                onClick={newChat}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 999,
                  padding: "9px 14px",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                New chat
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close agent panel"
              style={{
                flex: "none",
                width: 40,
                height: 40,
                border: "1px solid var(--line)",
                borderRadius: 999,
                background: "transparent",
                cursor: "pointer",
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* "Looking at" card */}
        {selectedFile && (
          <div style={{ background: "var(--panel)", borderRadius: 10, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Geist Mono',monospace", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: sectionColor(section) }} />
              Looking at
            </div>
            <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.25, fontWeight: 500, letterSpacing: "-0.02em" }}>
              {selectedFile.name}
            </h3>
          </div>
        )}

        {/* Observations (no conversation) or the conversation itself */}
        {!hasThread ? (
          <Observations
            clientId={clientId}
            section={section}
            selectedFile={selectedFile}
          />
        ) : (
          <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: "14px 14px 4px 14px",
                    background: "var(--panel)",
                    fontSize: 15,
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.text}
                </div>
              ) : (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
                    {MODE_TITLE[mode]}
                  </span>
                  <div style={{ fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap", color: m.error ? "var(--risk)" : "var(--ink)" }}>
                    {m.text}
                  </div>
                </div>
              )
            )}
            {thinking && live && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
                  {MODE_TITLE[mode]}
                </span>
                <div style={{ fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {live}
                </div>
              </div>
            )}
            {thinking && !live && (
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "var(--muted)" }}>
                Thinking…
              </span>
            )}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={send}
          style={{
            marginTop: "auto",
            position: "sticky",
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 10,
            background: "var(--input)",
            border: "1px solid var(--input-line)",
            borderRadius: 16,
          }}
        >
          <input
            aria-label="Message the agent"
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={thinking}
            style={{
              width: "100%",
              height: 44,
              padding: "0 8px",
              font: "inherit",
              fontSize: 15,
              color: "var(--ink)",
              background: "transparent",
              border: 0,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div role="radiogroup" aria-label="What should the agent do" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(["ask", "design"] as AgentMode[]).map((m) => {
                const active = m === mode;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(m)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 999,
                      border: `1px solid ${active ? "var(--ink)" : "var(--line)"}`,
                      background: active ? "var(--ink)" : "transparent",
                      color: active ? "var(--bg)" : "var(--ink)",
                      cursor: "pointer",
                      fontSize: 13,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m === "ask" ? "Ask" : "Design opinion"}
                  </button>
                );
              })}
            </div>
            <button
              type="submit"
              aria-label="Send"
              disabled={thinking}
              style={{
                flex: "none",
                width: 38,
                height: 38,
                padding: 0,
                border: 0,
                borderRadius: 999,
                background: "var(--ink)",
                color: "var(--bg)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SendIcon />
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
