/** The four fixed sections every client workspace has. */
export const SECTION_KEYS = ["vision", "roadmap", "field", "knowledge"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTIONS: { key: SectionKey; name: string; color: string }[] = [
  { key: "vision", name: "Vision", color: "var(--vision)" },
  { key: "roadmap", name: "Roadmap", color: "var(--roadmap)" },
  { key: "field", name: "Field", color: "var(--field)" },
  { key: "knowledge", name: "Knowledge", color: "var(--knowledge)" },
];

export function sectionName(key: SectionKey): string {
  return SECTIONS.find((s) => s.key === key)?.name ?? key;
}
export function sectionColor(key: SectionKey): string {
  return SECTIONS.find((s) => s.key === key)?.color ?? "var(--ink)";
}

/** File-type tags shown in the UI (matches the prototype's TAG map). */
export const TYPE_TAG: Record<string, string> = {
  doc: "Doc",
  sheet: "Sheet",
  rec: "Rec",
  demo: "Demo",
  design: "Figma",
  task: "Task",
  msg: "Slack",
  mail: "Email",
  ticket: "Ticket",
};

/** Map a file extension to a coarse file-type (matches the prototype's EXT). */
export const EXT_TYPE: Record<string, string> = {
  pdf: "doc", doc: "doc", docx: "doc", txt: "doc", md: "doc", rtf: "doc",
  pages: "doc", json: "doc",
  key: "demo", ppt: "demo", pptx: "demo", mp4: "demo", mov: "demo", html: "demo",
  xls: "sheet", xlsx: "sheet", csv: "sheet", numbers: "sheet",
  png: "design", jpg: "design", jpeg: "design", gif: "design", webp: "design",
  svg: "design", fig: "design",
  mp3: "rec", m4a: "rec", wav: "rec",
  eml: "mail", msg: "mail",
};

export function fileTypeForName(name: string): string {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return EXT_TYPE[ext] ?? "doc";
}
