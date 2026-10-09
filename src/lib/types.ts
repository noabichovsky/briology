import type { SectionKey } from "@/lib/sections";

export type ClientDTO = { id: string; name: string };

export type TreeNode = {
  id: string;
  kind: "folder" | "file";
  name: string;
  fileType: string | null;
  mime: string | null;
  size: number | null;
  isNew: boolean;
  createdAt: number;
  children?: TreeNode[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
};

export type AgentMode = "ask" | "design";

export type Observation = {
  title: string;
  body: string;
  severity: string | null;
  linkLabel: string | null;
};

export type SectionObservations = {
  heading?: string;
  themes?: { name: string; count: number }[];
  items: Observation[];
};

export type { SectionKey };
