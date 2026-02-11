import { useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import NotesPanel from "./components/NotesPanel";
import NoSession from "./components/stages/NoSession";
import ActorsSetup from "./components/stages/ActorsSetup";
import { uid } from "./lib/ids";
import { ensureDraftShape, hasActors, readDraft, writeDraft } from "./lib/draft";

export default function App() {
  const initial = useMemo(() => ensureDraftShape(readDraft()), []);
  const [draft, setDraft] = useState(
    initial || { session_id: "", title: "", roles: [], start_role: "", notes: [] }
  );

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

  function createLocalSession() {
    const session_id = `local_${Date.now()}`;
    updateDraft({ session_id, title: "Local session", roles: [], start_role: "", notes: [] });
  }

  function saveActors({ roles, start_role }) {
    updateDraft({ ...draft, roles, start_role });
  }

  function addNote(text) {
    const note = {
      note_id: uid("note"),
      ts: new Date().toISOString(),
      author: "user",
      text,
    };
    updateDraft({ ...draft, notes: [...(draft.notes || []), note] });
  }

  const left =
    phase === "no_session" ? (
      <NoSession onCreateLocal={createLocalSession} />
    ) : phase === "actors_setup" ? (
      <ActorsSetup draft={draft} onSaveActors={saveActors} />
    ) : (
      <NotesPanel locked={false} />
    );

  return (
    <AppShell
      sessionId={draft.session_id}
      mode={phase}
      left={left}
      locked={locked}
      notes={draft.notes || []}
      onAddNote={addNote}
      onNewLocalSession={createLocalSession}
    />
  );
}
