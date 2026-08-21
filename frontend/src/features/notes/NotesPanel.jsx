import ActorsCard from "./components/ActorsCard";
import NotesCard from "./components/NotesCard";
import NotesComposer from "./components/NotesComposer";

export default function NotesPanel({ draft, onAddNote, disabled, onEditActors, onGenerate, canGenerate }) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  const notes = Array.isArray(draft?.notes) ? draft.notes : [];
  const startRole = typeof draft?.start_role === "string" ? draft.start_role : "";

  const genEnabled = !!canGenerate && typeof onGenerate === "function";

  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>

      <div className="panelBody">
        <ActorsCard roles={roles} startRole={startRole} onEditActors={onEditActors} />

        <NotesCard notes={notes} />

        <button className="primaryBtn" onClick={onGenerate} disabled={!genEnabled}>
          Сгенерировать процесс
        </button>

        <div className="small muted" style={{ marginTop: 10 }}>
          Кнопка активируется после подключения “normalize → nodes/edges → bpmn export”.
        </div>

        <NotesComposer disabled={!!disabled} onAddNote={onAddNote} />
      </div>
    </div>
  );
}
