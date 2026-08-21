import { readJson, writeJson } from "./storage";

export const LS_KEY = "fp_copilot_draft_v0";

export function readDraft() {
  return readJson(LS_KEY, null);
}

export function writeDraft(draft) {
  writeJson(LS_KEY, draft);
}

export function ensureDraftShape(d) {
  if (!d || typeof d !== "object") return null;

  const roles = Array.isArray(d.roles) ? d.roles : [];
  const notes = Array.isArray(d.notes) ? d.notes : [];
  const nodes = Array.isArray(d.nodes) ? d.nodes : [];
  const edges = Array.isArray(d.edges) ? d.edges : [];
  const questions = Array.isArray(d.questions) ? d.questions : [];

  return {
    session_id: typeof d.session_id === "string" ? d.session_id : "",
    title: typeof d.title === "string" ? d.title : "",
    roles,
    start_role: typeof d.start_role === "string" ? d.start_role : "",
    notes,
    nodes,
    edges,
    questions,
    ai_open: typeof d.ai_open === "boolean" ? d.ai_open : true,
    mode: typeof d.mode === "string" ? d.mode : "deep_audit",
    version: typeof d.version === "number" ? d.version : 0,
  };
}

export function defaultDraft() {
  return {
    session_id: "",
    title: "",
    roles: [],
    start_role: "",
    notes: [],
    nodes: [],
    edges: [],
    questions: [],
    ai_open: true,
    mode: "deep_audit",
    version: 0,
  };
}

export function hasActors(draft) {
  return (
    !!draft &&
    Array.isArray(draft.roles) &&
    draft.roles.length > 0 &&
    typeof draft.start_role === "string" &&
    draft.start_role.length > 0
  );
}
