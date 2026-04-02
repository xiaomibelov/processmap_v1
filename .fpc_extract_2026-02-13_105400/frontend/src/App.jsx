import { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ActorsSetup from "./components/stages/ActorsSetup";
import { uid } from "./lib/ids";
import { ensureDraftShape, hasActors, readDraft, writeDraft } from "./lib/draft";
import { apiCreateSession, apiGetSession, apiListSessions, apiPostNote } from "./lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

export default function App() {
  const initial = useMemo(() => ensureDraftShape(readDraft()), []);
  const [draft, setDraft] = useState(
    initial || { session_id: "", title: "", roles: [], start_role: "", notes: [] }
  );

  const [sessions, setSessions] = useState([]);
  const [backendStatus, setBackendStatus] = useState("idle"); // idle | ok | fail
  const [backendHint, setBackendHint] = useState("");

  const phase = !draft.session_id
    ? "no_session"
    : hasActors(draft)
      ? "interview"
      : "actors_setup";

  const locked = phase !== "interview";

  function updateDraft(next) {
    setDraft(next);
    writeDraft(next);
  }

  async function refreshSessions() {
    const r = await apiListSessions();
    if (r.ok) {
      setBackendStatus("ok");
      setBackendHint("");
      setSessions(r.sessions || []);
    } else {
      setBackendStatus("fail");
      setBackendHint(r.status === 401 ? "API вернул 401 (нужна авторизация?)" : "API недоступно или вернуло ошибку.");
      setSessions([]);
    }
  }

  useEffect(() => {
    refreshSessions();
  }, []);

  function createLocalSession() {
    const session_id = `local_${Date.now()}`;
    updateDraft({ session_id, title: "Local session", roles: [], start_role: "", notes: [] });
  }

  async function createBackendSession() {
    const r = await apiCreateSession({ title: "Interview session" });
    if (!r.ok) {
      setBackendStatus("fail");
      setBackendHint(r.status === 401 ? "API вернул 401 (нужна авторизация?)" : "Не удалось создать сессию через API.");
      return;
    }
    setBackendStatus("ok");
    setBackendHint("");
    updateDraft({ session_id: r.session_id, title: "Interview session", roles: [], start_role: "", notes: [] });
    refreshSessions();
  }

  async function openSession(sessionId) {
    if (!sessionId) return;
    const r = await apiGetSession(sessionId);
    if (!r.ok || !r.session) {
      setBackendStatus("fail");
      setBackendHint("Не удалось открыть сессию через API.");
      return;
    }
    setBackendStatus("ok");
    setBackendHint("");
    const shaped = ensureDraftShape(r.session);
    updateDraft(shaped);
  }

  function saveActors({ roles, start_role }) {
    updateDraft({ ...draft, roles, start_role });
  }

  async function addNote(text) {
    const note = {
      note_id: uid("note"),
      ts: new Date().toISOString(),
      author: "user",
      text,
    };
    const next = { ...draft, notes: [...(draft.notes || []), note] };
    updateDraft(next);

    if (draft.session_id && !isLocalSessionId(draft.session_id)) {
      await apiPostNote(draft.session_id, { text, ts: note.ts, author: note.author });
    }
  }

  const left =
    phase === "no_session" ? (
      <NoSession
        onCreateBackend={createBackendSession}
        onCreateLocal={createLocalSession}
        backendHint={backendHint}
      />
    ) : phase === "actors_setup" ? (
      <ActorsSetup draft={draft} onSaveActors={saveActors} />
    ) : (
      <NotesPanel draft={draft} />
    );

  return (
    <AppShell
      sessionId={draft.session_id}
      roles={draft.roles || []}
      mode={phase}
      left={left}
      locked={locked}
      notes={draft.notes || []}
      onAddNote={addNote}
      onNewLocalSession={createLocalSession}
      sessions={sessions}
      backendStatus={backendStatus}
      onRefreshSessions={refreshSessions}
      onNewBackendSession={createBackendSession}
      onOpenSession={openSession}
    />
  );
}
