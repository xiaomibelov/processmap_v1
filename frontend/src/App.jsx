import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ActorsSetup from "./components/stages/ActorsSetup";
import { uid } from "./lib/ids";
import { defaultDraft, ensureDraftShape, hasActors, readDraft, writeDraft } from "./lib/draft";
import { apiCreateSession, apiGetSession, apiListSessions, apiMeta, apiPostNote, apiSaveSession } from "./lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

export default function App() {
  const initial = useMemo(() => ensureDraftShape(readDraft()) || defaultDraft(), []);
  const [draft, setDraft] = useState(initial);

  const [apiOk, setApiOk] = useState(false);
  const [apiBase, setApiBase] = useState("");
  const [sessions, setSessions] = useState([]);

  const [bpmnReloadKey, setBpmnReloadKey] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [errorText, setErrorText] = useState("");

  const phase = !draft.session_id ? "no_session" : hasActors(draft) ? "interview" : "actors_setup";
  const locked = phase !== "interview";

  function updateDraft(next) {
    setDraft(next);
    writeDraft(next);
  }

  async function refreshSessionsSafe() {
    try {
      const list = await apiListSessions();
      if (Array.isArray(list)) setSessions(list);
    } catch {}
  }

  useEffect(() => {
    (async () => {
      try {
        const meta = await apiMeta();
        setApiOk(true);
        setApiBase(meta?.api_base || "");
      } catch {
        setApiOk(false);
      }
      refreshSessionsSafe();
    })();
  }, []);

  async function selectApiSession(sessionId) {
    setErrorText("");
    try {
      const s = await apiGetSession(sessionId);
      const shaped = ensureDraftShape(s) || defaultDraft();
      updateDraft(shaped);
      setBpmnReloadKey((x) => x + 1);
    } catch (e) {
      setErrorText(String(e?.message || e || "Не удалось загрузить сессию"));
    }
  }

  function createLocalSession() {
    setErrorText("");
    const session_id = `local_${Date.now()}`;
    updateDraft({ ...defaultDraft(), session_id, title: "Local session" });
    setBpmnReloadKey((x) => x + 1);
  }

  async function createApiSession() {
    setErrorText("");
    try {
      const s = await apiCreateSession({ title: "Новый процесс" });
      const shaped = ensureDraftShape(s) || defaultDraft();
      updateDraft(shaped);
      await refreshSessionsSafe();
      setBpmnReloadKey((x) => x + 1);
    } catch (e) {
      setErrorText(String(e?.message || e || "Не удалось создать API-сессию"));
    }
  }

  async function patchDraftToBackend(nextDraft) {
    updateDraft(nextDraft);

    const id = nextDraft.session_id;
    if (!id || isLocalSessionId(id)) return nextDraft;

    try {
      const saved = await apiSaveSession(id, nextDraft); // PATCH full shape
      const shaped = ensureDraftShape(saved) || nextDraft;
      updateDraft(shaped);
      return shaped;
    } catch (e) {
      setErrorText(String(e?.message || e || "Ошибка сохранения на бэке"));
      return nextDraft;
    }
  }

  async function saveActors({ roles, start_role }) {
    const next = { ...draft, roles, start_role };
    await patchDraftToBackend(next);
  }

  async function addNote(text) {
    setErrorText("");
    const note = { note_id: uid("note"), ts: new Date().toISOString(), author: "user", text };

    const next = { ...draft, notes: [...(draft.notes || []), note] };
    updateDraft(next);

    const id = next.session_id;
    if (!id || isLocalSessionId(id)) return;

    try {
      await apiPostNote(id, text);
      // sync back (server может нормализовать)
      const s = await apiGetSession(id);
      const shaped = ensureDraftShape(s) || next;
      updateDraft(shaped);
    } catch (e) {
      // fallback: try patch full draft
      await patchDraftToBackend(next);
    }
  }

  async function generateProcess() {
    setErrorText("");
    if (!draft.session_id || isLocalSessionId(draft.session_id)) {
      setErrorText("Нужна API-сессия (TopBar → “New API”), чтобы генерировать BPMN на бэке.");
      return;
    }

    setGenerating(true);
    try {
      await patchDraftToBackend(draft);
      setBpmnReloadKey((x) => x + 1);
    } finally {
      setGenerating(false);
    }
  }

  const left =
    phase === "no_session" ? (
      <NoSession onCreateLocal={createLocalSession} />
    ) : phase === "actors_setup" ? (
      <ActorsSetup draft={draft} onSaveActors={saveActors} />
    ) : (
      <NotesPanel
        draft={draft}
        onGenerate={generateProcess}
        generating={generating}
        onAddNote={addNote}
        addNoteDisabled={locked}
        errorText={errorText}
      />
    );

  return (
    <AppShell
      sessionId={draft.session_id}
      apiOk={apiOk}
      apiBase={apiBase}
      sessions={sessions}
      onSelectSession={selectApiSession}
      onNewLocalSession={createLocalSession}
      onNewApiSession={createApiSession}
      left={left}
      locked={locked}
      draft={draft}
      onPatchDraft={patchDraftToBackend}
      bpmnReloadKey={bpmnReloadKey}
    />
  );
}
