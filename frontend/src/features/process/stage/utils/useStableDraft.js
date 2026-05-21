import { useRef } from "react";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildDraftContentHash(draft) {
  if (!draft || typeof draft !== "object") return "__empty__";
  const d = asObject(draft);
  const interview = asObject(d.interview);
  const steps = asArray(interview.steps);
  const nodes = asArray(d.nodes);
  const edges = asArray(d.edges);
  const notes = asObject(d.notes_by_element || d.notesByElementId);
  const meta = asObject(d.bpmn_meta);
  const xmlHash = fnv1aHex(String(d.bpmn_xml || "").slice(0, 8000));
  const stepSig = steps
    .slice(0, 30)
    .map((s) => `${String(s.id || "").slice(0, 24)}:${String(s.action || s.name || "").slice(0, 30)}`)
    .join(",");
  const nodeSig = nodes
    .slice(0, 30)
    .map((n) => `${String(n.id || "").slice(0, 24)}:${String(n.name || "").slice(0, 30)}`)
    .join(",");
  const sig = [
    String(d.id || ""),
    String(d.session_id || d.sessionId || ""),
    xmlHash,
    String(d.title || ""),
    steps.length,
    stepSig,
    nodes.length,
    nodeSig,
    edges.length,
    Object.keys(notes).length,
    String(meta.updated_at || meta.updatedAt || ""),
    String(d.diagram_state_version || d.diagramStateVersion || ""),
    String(d.bpmn_xml_version || d.version || ""),
  ].join("|");
  return fnv1aHex(sig);
}

/**
 * Returns a stable draft reference when content hasn't changed.
 * Uses a render-phase ref update (safe because mutation is idempotent
 * and does not affect other components).
 */
export default function useStableDraft(draft) {
  const ref = useRef(draft);
  const hashRef = useRef("");
  const nextHash = buildDraftContentHash(draft);
  if (hashRef.current !== nextHash) {
    hashRef.current = nextHash;
    ref.current = draft;
  }
  return ref.current;
}
