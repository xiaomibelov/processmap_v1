import { useCallback, useMemo, useState } from "react";
import { uid } from "../../../lib/ids";
import {
  defaultDraft,
  ensureDraftShape,
  hasActors,
  readDraft,
  writeDraft,
} from "../../../lib/draft";
import { apiPatchSession, apiPostNote } from "../../../lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

export default function useDraft({ onOk, onFail } = {}) {
  const initialDraft = useMemo(() => ensureDraftShape(readDraft()) || defaultDraft(), []);
  const [draft, setDraft] = useState(initialDraft);
  const [reloadKey, setReloadKey] = useState(0);

  const phase = useMemo(() => {
    if (!draft?.session_id) return "no_session";
    return hasActors(draft) ? "interview" : "actors_setup";
  }, [draft]);

  const locked = phase !== "interview";

  const bumpReloadKey = useCallback(() => {
    setReloadKey((x) => x + 1);
  }, []);

  const updateDraft = useCallback(
    (next) => {
      const shaped = ensureDraftShape(next) || defaultDraft();
      setDraft(shaped);
      writeDraft(shaped);
      return shaped;
    },
    []
  );

  const setDraftFromSession = useCallback(
    (sessionObj) => {
      const shaped = ensureDraftShape(sessionObj) || defaultDraft();
      updateDraft(shaped);
      bumpReloadKey();
      return shaped;
    },
    [updateDraft, bumpReloadKey]
  );

  const createLocalSession = useCallback(() => {
    const sid = `local_${Date.now()}`;
    updateDraft({ ...defaultDraft(), session_id: sid, title: "Local session" });
    bumpReloadKey();
    return sid;
  }, [updateDraft, bumpReloadKey]);

  const patchDraft = useCallback(
    async (nextDraft) => {
      const shaped = ensureDraftShape(nextDraft) || defaultDraft();
      updateDraft(shaped);

      const sid = shaped.session_id || "";
      if (!sid || isLocalSessionId(sid)) return { ok: true, local: true };

      const r = await apiPatchSession(sid, shaped);
      if (!r.ok) {
        onFail?.(String(r.error || "Не удалось сохранить изменения в сессии."));
        return { ok: false };
      }

      onOk?.();
      bumpReloadKey();
      return { ok: true };
    },
    [updateDraft, onOk, onFail, bumpReloadKey]
  );

  const saveActors = useCallback(
    async ({ roles, start_role }) => {
      const next = {
        ...draft,
        roles: Array.isArray(roles) ? roles : [],
        start_role: String(start_role || ""),
      };
      return await patchDraft(next);
    },
    [draft, patchDraft]
  );

  const addNote = useCallback(
    async (text) => {
      const t = String(text || "").trim();
      if (!t) return { ok: false };

      const note = {
        note_id: uid("note"),
        ts: new Date().toISOString(),
        author: "user",
        text: t,
      };

      const next = {
        ...draft,
        notes: [...(Array.isArray(draft.notes) ? draft.notes : []), note],
      };

      updateDraft(next);

      const sid = next.session_id || "";
      if (!sid || isLocalSessionId(sid)) return { ok: true, local: true };

      const r = await apiPostNote(sid, { text: note.text, ts: note.ts, author: note.author });
      if (!r.ok) {
        onFail?.(String(r.error || "Не удалось отправить заметку в API."));
        return { ok: false };
      }

      onOk?.();
      return { ok: true };
    },
    [draft, updateDraft, onOk, onFail]
  );

  return {
    draft,
    setDraftFromSession,
    updateDraft,

    phase,
    locked,

    reloadKey,
    bumpReloadKey,

    createLocalSession,
    patchDraft,
    saveActors,
    addNote,
  };
}
