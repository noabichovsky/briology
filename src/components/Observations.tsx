"use client";

import { useCallback, useEffect, useState } from "react";
import { withBase } from "@/lib/basePath";
import { sectionName, type SectionKey } from "@/lib/sections";
import type { Observation, TreeNode } from "@/lib/types";

type Theme = { name: string; count: number };

type Props = {
  clientId: string | null;
  section: SectionKey;
  selectedFile: TreeNode | null;
};

export default function Observations({ clientId, section, selectedFile }: Props) {
  const [notes, setNotes] = useState<Observation[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) {
      setNotes([]);
      setThemes([]);
      return;
    }
    const res = await fetch(
      withBase(`/api/notes?client=${clientId}&section=${section}`)
    );
    if (res.ok) {
      const data = (await res.json()) as {
        notes: Observation[];
        themes: Theme[];
      };
      setNotes(data.notes);
      setThemes(data.themes);
    }
  }, [clientId, section]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    if (!clientId || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(
        withBase(`/api/notes?client=${clientId}&section=${section}`),
        { method: "POST" }
      );
      const data = (await res.json()) as {
        notes?: Observation[];
        themes?: Theme[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not generate observations.");
        return;
      }
      setNotes(data.notes ?? []);
      setThemes(data.themes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  const heading = selectedFile
    ? `Across ${sectionName(section).toLowerCase()}`
    : "What I'm noticing";
  const isField = section === "field";
  const maxCount = Math.max(1, ...themes.map((t) => t.count));
  const hasContent = notes.length > 0 || (isField && themes.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h4 style={{ margin: 0, fontFamily: "'Geist Mono',monospace", fontSize: 11, fontWeight: 400, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
          {heading}
        </h4>
        {clientId && (
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 999,
              padding: "6px 12px",
              background: "transparent",
              cursor: "pointer",
              fontSize: 12,
              color: "var(--muted)",
              whiteSpace: "nowrap",
            }}
          >
            {generating ? "Generating…" : hasContent ? "Refresh" : "Generate"}
          </button>
        )}
      </div>

      {/* Field theme bars */}
      {isField && themes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {themes.map((t, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px", fontSize: 14.5 }}>
              <span>{t.name}</span>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "var(--muted)" }}>
                {t.count}
              </span>
              <span style={{ gridColumn: "1 / -1", height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden" }}>
                <i style={{ display: "block", height: "100%", width: `${(t.count / maxCount) * 100}%`, background: "var(--field)" }} />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {notes.map((o, i) => (
        <div key={i} style={{ paddingTop: 16, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 4 }}>
          <b style={{ fontSize: 15.5, fontWeight: 500, letterSpacing: "-0.01em" }}>{o.title}</b>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
            {o.severity && (
              <span style={{ fontWeight: 500, color: o.severity === "High" ? "var(--risk)" : "var(--ink)" }}>
                {o.severity}
              </span>
            )}
            {o.severity ? " · " : ""}
            {o.body}
          </p>
          {o.linkLabel && (
            <span style={{ marginTop: 2, fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: "var(--muted)" }}>
              {o.linkLabel}
            </span>
          )}
        </div>
      ))}

      {/* Empty / error states */}
      {!hasContent && (
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "var(--muted)" }}>
          Nothing yet. Upload content to {sectionName(section).toLowerCase()},
          then generate observations or ask a question below.
        </p>
      )}
      {error && (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--risk)" }}>{error}</p>
      )}
    </div>
  );
}
