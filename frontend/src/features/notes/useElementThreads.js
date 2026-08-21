import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiAddNoteThreadComment,
  apiCreateNoteThread,
  apiListNoteThreads,
} from "../../lib/api.js";

function text(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function threadUpdatedAt(thread) {
  const raw = Number(thread?.updated_at || thread?.updatedAt || thread?.created_at || 0);
  return Number.isFinite(raw) ? raw : 0;
}

function emitNotesAggregateChanged(sessionId) {
  if (typeof window === "undefined") return;
  const sid = text(sessionId);
  if (!sid) return;
  window.dispatchEvent(new CustomEvent("processmap:notes-aggregate-changed", {
    detail: { sessionId: sid },
  }));
}

// Same contract as NotesMvpPanel.emitElementNoteThreadsChanged: the payload carries
// per-element open-thread counts for the WHOLE session (the canvas badge listener
// replaces its map with the payload, so a partial map would wipe other elements).
function emitElementNoteThreadsChanged(sessionId, threads) {
  if (typeof window === "undefined") return;
  const sid = text(sessionId);
  if (!sid) return;
  const countsByElementId = {};
  for (const thread of asArray(threads)) {
    if (text(thread?.scope_type) !== "diagram_element") continue;
    const ref = thread?.scope_ref || thread?.scopeRef || {};
    const eid = text(ref.element_id || ref.elementId);
    if (!eid) continue;
    countsByElementId[eid] = (countsByElementId[eid] || 0) + 1;
  }
  window.dispatchEvent(new CustomEvent("processmap:element-note-threads-changed", {
    detail: { sessionId: sid, countsByElementId },
  }));
}

/**
 * Element-scoped note threads ("FB помощник" in the sidebar).
 * Read: threads where scope_type="diagram_element" and scope_ref.element_id = elementId.
 * Writes reuse the existing note_threads API (outside diagram CAS — never touches
 * bpmn_xml / diagram_state_version).
 */
export function useElementThreads(sessionId, elementId) {
  const sid = text(sessionId);
  const eid = text(elementId);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reqIdRef = useRef(0);

  const fetchThreads = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    if (!sid || !eid) {
      setThreads([]);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const result = await apiListNoteThreads(sid, { scopeType: "diagram_element", elementId: eid });
    if (reqId !== reqIdRef.current) return; // superseded by a newer request
    if (!result.ok) {
      setError(String(result.error || "Не удалось загрузить заметки."));
      setThreads([]);
      setLoading(false);
      return;
    }
    const items = asArray(result.items).slice().sort((a, b) => threadUpdatedAt(b) - threadUpdatedAt(a));
    setThreads(items);
    setLoading(false);
  }, [sid, eid]);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  // After a write, broadcast the full-session counts so canvas badges / aggregates
  // refresh exactly like they do after NotesMvpPanel mutations.
  const syncThreadBadges = useCallback(async () => {
    if (!sid) return;
    const result = await apiListNoteThreads(sid, {});
    emitElementNoteThreadsChanged(sid, result.ok ? asArray(result.items) : []);
    emitNotesAggregateChanged(sid);
  }, [sid]);

  const createThread = useCallback(async ({ body, priority = "normal", requiresAttention = false } = {}) => {
    const noteBody = text(body);
    if (!sid || !eid || !noteBody) return { ok: false, error: "empty" };
    const result = await apiCreateNoteThread(sid, {
      scope_type: "diagram_element",
      scope_ref: { element_id: eid },
      body: noteBody,
      priority,
      requires_attention: requiresAttention,
    });
    if (!result.ok) return result;
    await fetchThreads();
    await syncThreadBadges();
    return result;
  }, [sid, eid, fetchThreads, syncThreadBadges]);

  const addComment = useCallback(async (threadId, body) => {
    const tid = text(threadId);
    const noteBody = text(body);
    if (!tid || !noteBody) return { ok: false, error: "empty" };
    const result = await apiAddNoteThreadComment(tid, { body: noteBody });
    if (!result.ok) return result;
    await fetchThreads();
    await syncThreadBadges();
    return result;
  }, [sid, fetchThreads, syncThreadBadges]);

  return { threads, loading, error, createThread, addComment, refetch: fetchThreads };
}
