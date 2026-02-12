import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ActorsSetup from "./components/stages/ActorsSetup";
import { uid } from "./lib/ids";
import { ensureDraftShape, hasActors, readDraft, writeDraft } from "./lib/draft";
import { apiCreateSession, apiGetBpmn, apiGetSession, apiListSessions, apiMeta, apiPostNote, apiSaveSession } from "./lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

export default function App() {
  const initial = useMemo(() => ensureDraftShape(readDraft()), []);
  const [draft, setDraft] = useState(initial || { session_id: "", title: "", roles: [], start_role: "", notes: [], nodes: [], edges: [], questions: [] });

  const [sessions, setSessions] = useState([]);
  const [backendStatus, setBackendStatus] = useState("idle"); // idle | ok | fail
  const [backendHint, setBackendHint] = useState("");
  const [bpmnXml, setBpmnXml] = useState("");

  const phase = !draft.session_id ? "no_session" : hasActors(draft) ? "interview" : "actors_setup";
  const locked = phase !== "interview";

  function updateDraft(next) {
    const shaped = ensureDraftShape(next);
    setDraft(shaped);
    writeDraft(shaped);
  }

  async function refreshMetaAndSessions() {
    const m = await apiMeta();
    const s = await apiListSessions();
    if (m.ok && s.ok) {
      setBackendStatus("ok");
      setBackendHint("");
      setSessions(s.sessions || []);
      return;
    }
    setBackendStatus("fail");
    setBackendHint(m.message || s.message || "API недоступно.");
    setSessions([]);
  }

  useEffect(() => { refreshMetaAndSessions(); }, []);

  function createLocalSession() {
    const session_id = `local_${Date.now()}`;
    updateDraft({ session_id, title: "Local session", roles: [], start_role: "", notes: [], nodes: [], edges: [], questions: [] });
    setBpmnXml("");
  }

  async function createBackendSession() {
    const r = await apiCreateSession({ title: "Interview session" });
    if (!r.ok || !r.session_id) {
      setBackendStatus("fail");
      setBackendHint(r.status === 401 ? "API вернул 401 (нужна авторизация?)" : (r.message || "Не удалось создать сессию через API."));
      return;
    }
    setBackendStatus("ok");
    setBackendHint("");
    updateDraft({ session_id: r.session_id, ...(r.session || {}), roles: [], start_role: "", notes: [], nodes: [], edges: [], questions: [] });
    await refreshMetaAndSessions();
  }

  async function openSession(sessionId) {
    if (!sessionId) return;
    const r = await apiGetSession(sessionId);
    if (!r.ok || !r.session) {
      setBackendStatus("fail");
      setBackendHint(r.message || "Не удалось открыть сессию через API.");
      return;
    }
    setBackendStatus("ok");
    setBackendHint("");
    updateDraft(r.session);
    setBpmnXml("");
  }

  function saveActors({ roles, start_role }) {
    updateDraft({ ...draft, roles, start_role });
  }

  async function addNote(text) {
    const note = { note_id: uid("note"), ts: new Date().toISOString(), author: "user", text };
    const next = { ...draft, notes: [...(draft.notes || []), note] };
    updateDraft(next);

    if (draft.session_id && !isLocalSessionId(draft.session_id)) {
      await apiPostNote(draft.session_id, { text, ts: note.ts, author: note.author });
    }
  }

  async function generateProcess() {
    if (!draft.session_id) return;

    if (isLocalSessionId(draft.session_id)) {
      setBackendStatus("fail");
      setBackendHint("Для генерации BPMN нужен Backend session: нажми “Новая (API)”.");
      return;
    }

    const saved = await apiSaveSession(draft.session_id, draft); // PATCH full shape
    if (!saved.ok) {
      setBackendStatus("fail");
      setBackendHint(saved.message || "Не удалось сохранить сессию (PATCH).");
      return;
    }
    if (saved.session) updateDraft(saved.session);

    const bpmn = await apiGetBpmn(draft.session_id); // GET /bpmn
    if (!bpmn.ok || !bpmn.text) {
      setBackendStatus("fail");
      setBackendHint(bpmn.message || "Не удалось получить BPMN (GET /bpmn).");
      return;
    }

    setBackendStatus("ok");
    setBackendHint("");
    setBpmnXml(bpmn.text);
  }

  const generateDisabled = locked || !(draft.roles?.length) || !draft.start_role;
  const generateHint = locked
    ? "Сначала заполни роли и выбери start_role."
    : isLocalSessionId(draft.session_id)
      ? "Local draft: для BPMN нажми “Новая (API)” и продолжай в backend session."
      : "PATCH session → GET /bpmn → рендер в viewer.";

  const left =
    phase === "no_session" ? (
      <NoSession onCreateBackend={createBackendSession} onCreateLocal={createLocalSession} backendHint={backendHint} />
    ) : phase === "actors_setup" ? (
      <ActorsSetup draft={draft} onSaveActors={saveActors} />
    ) : (
      <NotesPanel
        draft={draft}
        onAddNote={addNote}
        onGenerate={generateProcess}
        generateDisabled={generateDisabled}
        generateHint={generateHint}
        backendStatus={backendStatus}
      />
    );

  return (
    <AppShell
      sessionId={draft.session_id}
      mode={phase}
      left={left}
      locked={locked}
      sessions={sessions}
      backendStatus={backendStatus}
      backendHint={backendHint}
      onRefreshSessions={refreshMetaAndSessions}
      onNewLocalSession={createLocalSession}
      onNewBackendSession={createBackendSession}
      onOpenSession={openSession}
      bpmnXml={bpmnXml}
      onRequestBpmnReload={() => setBpmnXml("")}
    />
  );
}
