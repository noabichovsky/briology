"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withBase } from "@/lib/basePath";
import {
  SECTIONS,
  TYPE_TAG,
  type SectionKey,
} from "@/lib/sections";
import type { ClientDTO, TreeNode } from "@/lib/types";
import {
  FolderIcon,
  FileIcon,
  ChevronIcon,
  CheckIcon,
  SearchIcon,
  UploadIcon,
  NewFolderIcon,
  TrashIcon,
} from "@/components/icons";
import AgentPanel from "@/components/AgentPanel";

type Sort = "name" | "new";

/** Normalize a name for sorting: drop leading quotes/# and lowercase. */
function sortKey(n: TreeNode): string {
  return n.name.replace(/^["“#]+/, "").toLowerCase();
}

type Props = {
  user: { email: string; role: "admin" | "client" };
  initialClients: ClientDTO[];
  initialClientId: string | null;
};

type Theme = "auto" | "light" | "dark";

/** Does this node (or anything inside it) count as "new"? */
function hasNew(node: TreeNode): boolean {
  return node.kind === "folder"
    ? (node.children ?? []).some(hasNew)
    : node.isNew;
}

/** Folders always first, then by the chosen sort (name A–Z, or new first). */
function ordered(list: TreeNode[], sort: Sort): TreeNode[] {
  const indexed = list.map((n, i) => ({ n, i }));
  indexed.sort((a, b) => {
    const folderDiff =
      Number(b.n.kind === "folder") - Number(a.n.kind === "folder");
    if (folderDiff) return folderDiff;
    if (sort === "new") {
      return Number(hasNew(b.n)) - Number(hasNew(a.n)) || a.i - b.i;
    }
    return sortKey(a.n).localeCompare(sortKey(b.n));
  });
  return indexed.map((x) => x.n);
}

export default function Workspace({
  user,
  initialClients,
  initialClientId,
}: Props) {
  const isAdmin = user.role === "admin";

  const [clients, setClients] = useState<ClientDTO[]>(initialClients);
  const [clientId, setClientId] = useState<string | null>(initialClientId);
  const [section, setSection] = useState<SectionKey>("vision");

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [trail, setTrail] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [theme, setTheme] = useState<Theme>("auto");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(420);

  const [menuOpen, setMenuOpen] = useState(false);
  const [addingClient, setAddingClient] = useState(false);

  const colsRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const currentClient = clients.find((c) => c.id === clientId) ?? null;
  const sectionDef = SECTIONS.find((s) => s.key === section)!;

  // --- Theme ---------------------------------------------------------------
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(dark ? "light" : "dark");
  };

  // --- Load the tree for the current client + section ----------------------
  const loadTree = useCallback(async () => {
    if (!clientId) {
      setTree([]);
      setSectionId(null);
      return;
    }
    const res = await fetch(
      withBase(`/api/tree?client=${clientId}&section=${section}`)
    );
    if (res.ok) {
      const data = (await res.json()) as {
        tree: TreeNode[];
        sectionId: string | null;
      };
      setTree(data.tree);
      setSectionId(data.sectionId);
    }
  }, [clientId, section]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Reset navigation when the client or section changes.
  useEffect(() => {
    setTrail([]);
    setSel(null);
    setQuery("");
    setCreatingFolder(false);
  }, [clientId, section]);

  // Auto-scroll the browser to the far right when the path/selection changes.
  useEffect(() => {
    const el = colsRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [trail, sel, tree]);

  // --- Derived: columns + preview ------------------------------------------
  const findNode = useCallback(
    (id: string | null): TreeNode | null => {
      if (!id) return null;
      const walk = (list: TreeNode[]): TreeNode | null => {
        for (const n of list) {
          if (n.id === id) return n;
          if (n.children) {
            const r = walk(n.children);
            if (r) return r;
          }
        }
        return null;
      };
      return walk(tree);
    },
    [tree]
  );

  const lists = useMemo(() => {
    const out: TreeNode[][] = [tree];
    for (const id of trail) {
      const folder = out[out.length - 1].find((n) => n.id === id);
      if (!folder || !folder.children) break;
      out.push(folder.children);
    }
    return out;
  }, [tree, trail]);

  const selectedFile = sel ? findNode(sel) : null;

  // --- Client switching / add / delete -------------------------------------
  async function switchClient(id: string) {
    setMenuOpen(false);
    if (id === clientId) return;
    setClientId(id);
  }

  async function addClient(name: string) {
    const trimmed = name.trim();
    setAddingClient(false);
    if (!trimmed) return;
    const existing = clients.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      switchClient(existing.id);
      return;
    }
    const res = await fetch(withBase("/api/clients"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      const { client } = (await res.json()) as { client: ClientDTO };
      setClients((cs) => [...cs, client].sort((a, b) => a.name.localeCompare(b.name)));
      setClientId(client.id);
      setMenuOpen(false);
    }
  }

  async function deleteClient(id: string) {
    const client = clients.find((c) => c.id === id);
    if (!client || clients.length < 2) return;
    if (
      !window.confirm(
        `Delete the client "${client.name}" and all of its content?`
      )
    )
      return;
    const res = await fetch(withBase(`/api/clients/${id}`), {
      method: "DELETE",
    });
    if (res.ok) {
      const rest = clients.filter((c) => c.id !== id);
      setClients(rest);
      if (id === clientId) setClientId(rest[0]?.id ?? null);
    }
  }

  // --- File operations -----------------------------------------------------
  const deepestParentId = trail.length ? trail[trail.length - 1] : null;

  /** The node a Delete action targets: selected file, else deepest folder. */
  const deleteTarget: TreeNode | null = sel
    ? findNode(sel)
    : deepestParentId
    ? findNode(deepestParentId)
    : null;

  async function doUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!sectionId) {
      setUploadMsg("Still loading this section — try again in a moment.");
      return;
    }
    setUploadMsg(
      `Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`
    );
    try {
      const form = new FormData();
      form.set("section_id", sectionId);
      if (deepestParentId) form.set("parent_id", deepestParentId);
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch(withBase("/api/nodes"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setUploadMsg(
          `Upload failed (${res.status}): ${data?.error ?? "unknown error"}`
        );
        return;
      }
      setUploadMsg(null);
      setSel(null);
      await loadTree();
    } catch (err) {
      setUploadMsg(
        "Upload failed: " + (err instanceof Error ? err.message : String(err))
      );
    }
  }

  async function commitNewFolder(name: string) {
    setCreatingFolder(false);
    if (!sectionId) return;
    const res = await fetch(withBase("/api/nodes"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section_id: sectionId,
        parent_id: deepestParentId,
        name: name.trim() || "Untitled folder",
      }),
    });
    if (res.ok) {
      const { node } = (await res.json()) as { node: TreeNode };
      await loadTree();
      setTrail((t) => [...t, node.id]); // open the new folder
      setSel(null);
    }
  }

  const remove = useCallback(async () => {
    const node = deleteTarget;
    if (!node || creatingFolder) return;
    const confirmMsg =
      node.kind === "folder"
        ? `Delete the folder "${node.name}" and everything inside it?`
        : `Delete "${node.name}"?`;
    if (!window.confirm(confirmMsg)) return;
    const res = await fetch(withBase(`/api/nodes/${node.id}`), {
      method: "DELETE",
    });
    if (res.ok) {
      const ti = trail.indexOf(node.id);
      if (ti >= 0) setTrail(trail.slice(0, ti));
      setSel(null);
      await loadTree();
    }
  }, [deleteTarget, creatingFolder, trail, loadTree]);

  // Delete / Backspace removes the current target (when not typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !/INPUT|TEXTAREA|SELECT/.test(tag)
      ) {
        e.preventDefault();
        remove();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [remove]);

  // --- Search --------------------------------------------------------------
  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return [];
    const out: {
      node: TreeNode;
      where: string;
      openTrail: string[];
    }[] = [];
    const walk = (list: TreeNode[], names: string[], ids: string[]) => {
      for (const n of ordered(list, sort)) {
        if (n.name.toLowerCase().includes(q)) {
          out.push({
            node: n,
            where: ["All files", ...names].join(" / "),
            openTrail: ids,
          });
        }
        if (n.children) walk(n.children, [...names, n.name], [...ids, n.id]);
      }
    };
    walk(tree, [], []);
    return out;
  }, [q, tree, sort]);

  function openSearchHit(hit: {
    node: TreeNode;
    openTrail: string[];
  }) {
    setQuery("");
    if (hit.node.kind === "folder") {
      setTrail([...hit.openTrail, hit.node.id]);
      setSel(null);
    } else {
      setTrail(hit.openTrail);
      setSel(hit.node.id);
    }
  }

  // --- Render --------------------------------------------------------------
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--ink)",
      }}
    >
      {/* Left: scrollable workspace */}
      <div style={{ flex: "1 1 0", minWidth: 0, height: "100%", overflowY: "auto" }}>
        {/* Header */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "12px 24px",
            padding: "22px clamp(20px,3vw,40px)",
            background: "var(--navbg)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          {/* Left group: client name / switcher */}
          <div style={{ flex: "1 1 0", minWidth: "max-content", display: "flex", alignItems: "center", gap: 16 }}>
            {!isAdmin && (
              <span style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.03em" }}>
                {currentClient?.name ?? "—"}
              </span>
            )}
            {isAdmin && (
              <div
                style={{ position: "relative" }}
                onMouseEnter={() => setMenuOpen(true)}
                onMouseLeave={() => {
                  if (!addingClient) setMenuOpen(false);
                }}
              >
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 12px",
                    marginLeft: -12,
                    border: 0,
                    borderRadius: 999,
                    background: menuOpen ? "var(--hover)" : "transparent",
                    cursor: "pointer",
                    fontSize: 20,
                    fontWeight: 500,
                    letterSpacing: "-0.03em",
                    transition: "background .15s",
                  }}
                >
                  {currentClient?.name ?? "Add a client"}
                </button>
                {menuOpen && (
                  <div style={{ position: "absolute", top: "100%", left: -12, paddingTop: 8, zIndex: 30 }}>
                    <div
                      role="listbox"
                      aria-label="Switch client"
                      style={{
                        minWidth: 240,
                        padding: 8,
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: 14,
                        boxShadow: "0 12px 32px rgba(0,0,0,.08)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {clients.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            borderRadius: 10,
                            background: c.id === clientId ? "var(--panel)" : "transparent",
                          }}
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={c.id === clientId}
                            onClick={() => switchClient(c.id)}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "10px 12px",
                              border: 0,
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: 15,
                              textAlign: "left",
                            }}
                          >
                            {c.name}
                            {c.id === clientId && <CheckIcon />}
                          </button>
                          {clients.length > 1 && (
                            <button
                              type="button"
                              onClick={() => deleteClient(c.id)}
                              aria-label={`Delete ${c.name}`}
                              title="Delete client"
                              style={{
                                flex: "none",
                                width: 32,
                                height: 32,
                                marginRight: 4,
                                border: 0,
                                borderRadius: 8,
                                background: "transparent",
                                cursor: "pointer",
                                color: "var(--muted)",
                                fontSize: 13,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <div style={{ height: 1, margin: "6px 4px", background: "var(--line)" }} />
                      {addingClient ? (
                        <input
                          aria-label="New client name"
                          placeholder="Client name"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addClient((e.target as HTMLInputElement).value);
                            } else if (e.key === "Escape") {
                              setAddingClient(false);
                            }
                          }}
                          onBlur={(e) => {
                            addClient(e.target.value);
                            setMenuOpen(false);
                          }}
                          style={{
                            margin: 2,
                            padding: "9px 10px",
                            border: "1px solid var(--ink)",
                            borderRadius: 8,
                            background: "var(--surface)",
                            color: "var(--ink)",
                            font: "inherit",
                            fontSize: 15,
                            outline: "none",
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingClient(true)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            border: 0,
                            borderRadius: 10,
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: 15,
                            textAlign: "left",
                            color: "var(--ink)",
                          }}
                        >
                          <span style={{ fontSize: 17, lineHeight: 1, fontWeight: 300 }}>+</span>
                          New client
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Centre: section nav */}
          <nav
            aria-label="Sections"
            style={{
              flex: "0 1 auto",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 4,
              maxWidth: "100%",
            }}
          >
            {SECTIONS.map((s) => {
              const current = s.key === section;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSection(s.key)}
                  aria-current={current ? "page" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 16px",
                    borderRadius: 999,
                    border: `1px solid ${current ? "var(--pill)" : "transparent"}`,
                    background: "transparent",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontSize: 16,
                  }}
                >
                  <i style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flex: "none" }} />
                  {s.name}
                </button>
              );
            })}
          </nav>

          {/* Right: theme + agent */}
          <div
            style={{
              flex: "1 1 0",
              minWidth: "max-content",
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                border: "1px solid var(--pill)",
                borderRadius: 999,
                padding: "10px 20px",
                background: "transparent",
                cursor: "pointer",
                fontSize: 14,
                whiteSpace: "nowrap",
              }}
            >
              Switch theme
            </button>
            {!panelOpen && (
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid var(--ink)",
                  borderRadius: 999,
                  padding: "10px 20px",
                  background: "var(--ink)",
                  color: "var(--bg)",
                  cursor: "pointer",
                  fontSize: 14,
                  whiteSpace: "nowrap",
                }}
              >
                <i style={{ width: 7, height: 7, borderRadius: "50%", background: sectionDef.color }} />
                Agent
              </button>
            )}
          </div>
        </header>

        {/* Workspace body */}
        <div style={{ padding: "clamp(28px,5vw,64px) clamp(20px,3vw,40px) 72px" }}>
          <main style={{ minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(48px,7vw,104px)",
                lineHeight: 0.95,
                fontWeight: 300,
                letterSpacing: "-0.05em",
              }}
            >
              {sectionDef.name}
            </h1>

            {!currentClient ? (
              <p style={{ marginTop: 32, color: "var(--muted)", fontSize: 16 }}>
                No clients yet. Use the menu at the top left to add your first
                client.
              </p>
            ) : (
              <>
                {/* Toolbar: search, sort, upload, new folder, delete */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    margin: "clamp(32px,5vw,56px) 0 16px",
                  }}
                >
                  <label
                    style={{
                      flex: "1 1 260px",
                      maxWidth: 420,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      height: 42,
                      padding: "0 14px",
                      background: "var(--input)",
                      border: "1px solid var(--input-line)",
                      borderRadius: 12,
                      color: "var(--muted)",
                    }}
                  >
                    <SearchIcon />
                    <input
                      type="search"
                      aria-label="Search files"
                      placeholder={`Search ${sectionDef.name.toLowerCase()}`}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        border: 0,
                        background: "transparent",
                        outline: "none",
                        font: "inherit",
                        fontSize: 15,
                        color: "var(--ink)",
                      }}
                    />
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                    <div
                      role="group"
                      aria-label="Sort by"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        padding: "3px 3px 3px 12px",
                        border: "1px solid var(--line)",
                        borderRadius: 999,
                      }}
                    >
                      <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", marginRight: 6 }}>
                        Sort
                      </span>
                      {(["name", "new"] as Sort[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={sort === s}
                          onClick={() => setSort(s)}
                          style={{
                            padding: "6px 12px",
                            border: 0,
                            borderRadius: 999,
                            background: sort === s ? "var(--ink)" : "transparent",
                            color: sort === s ? "var(--bg)" : "var(--ink)",
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          {s === "name" ? "Name" : "New"}
                        </button>
                      ))}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      onChange={(e) => {
                        doUpload(e.target.files);
                        e.target.value = "";
                      }}
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        height: 38,
                        padding: "0 16px",
                        border: "1px solid var(--ink)",
                        borderRadius: 999,
                        background: "var(--ink)",
                        color: "var(--bg)",
                        cursor: "pointer",
                        fontSize: 14,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <UploadIcon />
                      Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSel(null);
                        setCreatingFolder(true);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        height: 38,
                        padding: "0 16px",
                        border: "1px solid var(--pill)",
                        borderRadius: 999,
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: 14,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <NewFolderIcon />
                      New folder
                    </button>
                    <button
                      type="button"
                      onClick={remove}
                      disabled={!deleteTarget}
                      title={
                        deleteTarget
                          ? `Delete "${deleteTarget.name}" (Delete key)`
                          : "Select a file or folder to delete"
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        height: 38,
                        padding: "0 16px",
                        border: "1px solid var(--pill)",
                        borderRadius: 999,
                        background: "transparent",
                        cursor: deleteTarget ? "pointer" : "default",
                        fontSize: 14,
                        whiteSpace: "nowrap",
                        opacity: deleteTarget ? 1 : 0.4,
                      }}
                    >
                      <TrashIcon />
                      Delete
                    </button>
                  </div>
                </div>

                {uploadMsg && (
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: 13.5,
                      color: uploadMsg.toLowerCase().includes("fail")
                        ? "var(--risk)"
                        : "var(--muted)",
                    }}
                  >
                    {uploadMsg}
                  </p>
                )}

                {q ? (
                  /* Search results replace the columns while searching */
                  <div style={{ borderTop: "1px solid var(--line)" }}>
                    {searchResults.map((hit) => (
                      <button
                        key={hit.node.id}
                        type="button"
                        onClick={() => openSearchHit(hit)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "20px minmax(0,1fr) auto",
                          gap: 12,
                          alignItems: "center",
                          width: "100%",
                          padding: "14px 12px",
                          border: 0,
                          borderBottom: "1px solid var(--line)",
                          background: "transparent",
                          textAlign: "left",
                          cursor: "pointer",
                          color: "var(--ink)",
                        }}
                      >
                        {hit.node.kind === "folder" ? <FolderIcon /> : <FileIcon />}
                        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 16, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {hit.node.name}
                          </span>
                          <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {hit.where}
                          </span>
                        </span>
                        {hasNew(hit.node) && (
                          <i title="New" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--risk)" }} />
                        )}
                      </button>
                    ))}
                    {searchResults.length === 0 && (
                      <p style={{ margin: 0, padding: "28px 12px", color: "var(--muted)", fontSize: 15 }}>
                        No matches for “{query}”
                      </p>
                    )}
                  </div>
                ) : (
              <div
                ref={colsRef}
                style={{
                  display: "flex",
                  height: "clamp(360px,calc(100vh - 340px),760px)",
                  borderTop: "1px solid var(--line)",
                  borderBottom: "1px solid var(--line)",
                  overflowX: "auto",
                }}
              >
                {lists.map((list, ci) => {
                  const items = ordered(list, sort);
                  const isDeepest = ci === lists.length - 1;
                  return (
                    <div
                      key={ci}
                      style={{
                        flex: "0 0 280px",
                        borderRight: "1px solid var(--line)",
                        overflowY: "auto",
                        padding: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                      }}
                    >
                      {items.length === 0 && (
                        <p style={{ margin: 0, padding: "20px 10px", color: "var(--muted)", fontSize: 14, lineHeight: 1.45 }}>
                          {ci === 0
                            ? `No files yet. Upload files or create a folder to start ${sectionDef.name.toLowerCase()}.`
                            : "Empty folder"}
                        </p>
                      )}
                      {items.map((n) => {
                        const isFolder = n.kind === "folder";
                        const inTrail = isFolder && trail[ci] === n.id;
                        const active = isFolder
                          ? inTrail && ci === trail.length - 1 && !sel
                          : sel === n.id;
                        return (
                          <button
                            key={n.id}
                            type="button"
                            aria-pressed={active || inTrail}
                            title={n.name}
                            onClick={() =>
                              isFolder
                                ? (setTrail([...trail.slice(0, ci), n.id]), setSel(null))
                                : (setTrail(trail.slice(0, ci)), setSel(n.id))
                            }
                            style={{
                              display: "grid",
                              gridTemplateColumns: "18px minmax(0,1fr) auto",
                              gap: 10,
                              alignItems: "center",
                              width: "100%",
                              padding: "9px 10px",
                              border: 0,
                              borderRadius: 8,
                              background: active
                                ? "var(--ink)"
                                : inTrail
                                ? "var(--panel)"
                                : "transparent",
                              color: active ? "var(--bg)" : "var(--ink)",
                              textAlign: "left",
                              cursor: "pointer",
                              fontSize: 15,
                            }}
                          >
                            {isFolder ? <FolderIcon /> : <FileIcon />}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
                              {n.name}
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.7 }}>
                              {hasNew(n) && (
                                <i title="New" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--risk)" }} />
                              )}
                              {isFolder && <ChevronIcon />}
                            </span>
                          </button>
                        );
                      })}
                      {isDeepest && creatingFolder && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "18px minmax(0,1fr)",
                            gap: 10,
                            alignItems: "center",
                            padding: "4px 6px 4px 10px",
                            borderRadius: 8,
                            background: "var(--panel)",
                          }}
                        >
                          <FolderIcon />
                          <input
                            aria-label="Folder name"
                            autoFocus
                            defaultValue="Untitled folder"
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "Escape") {
                                e.preventDefault();
                                if (e.key === "Escape") setCreatingFolder(false);
                                else
                                  commitNewFolder(
                                    (e.target as HTMLInputElement).value
                                  );
                              }
                            }}
                            onBlur={(e) => commitNewFolder(e.target.value)}
                            style={{
                              minWidth: 0,
                              padding: "5px 8px",
                              border: "1px solid var(--ink)",
                              borderRadius: 6,
                              background: "var(--surface)",
                              color: "var(--ink)",
                              font: "inherit",
                              fontSize: 15,
                              outline: "none",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {selectedFile && (
                  <div
                    style={{
                      flex: "1 0 300px",
                      padding: 28,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "'Geist Mono',monospace", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
                      <span>{TYPE_TAG[selectedFile.fileType ?? ""] ?? selectedFile.fileType}</span>
                      {selectedFile.isNew && (
                        <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--risk)" }}>
                          <i style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--risk)" }} />
                          New
                        </span>
                      )}
                    </div>
                    <h2 style={{ margin: 0, fontSize: "clamp(22px,2.2vw,30px)", lineHeight: 1.15, fontWeight: 400, letterSpacing: "-0.035em" }}>
                      {selectedFile.name}
                    </h2>
                    <p style={{ margin: 0, fontSize: 14.5, color: "var(--muted)" }}>
                      {selectedFile.size
                        ? `${Math.max(1, Math.round(selectedFile.size / 1024))} KB · `
                        : ""}
                      {new Date(selectedFile.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </p>
                    {!panelOpen && (
                      <button
                        type="button"
                        onClick={() => setPanelOpen(true)}
                        style={{
                          marginTop: 8,
                          border: "1px solid var(--pill)",
                          borderRadius: 999,
                          padding: "9px 16px",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 13.5,
                        }}
                      >
                        Ask the agent about this
                      </button>
                    )}
                  </div>
                )}
              </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* Right: agent panel */}
      {panelOpen && (
        <AgentPanel
          width={panelWidth}
          onWidth={setPanelWidth}
          onClose={() => setPanelOpen(false)}
          section={section}
          selectedFile={selectedFile}
          clientId={clientId}
        />
      )}
    </div>
  );
}
