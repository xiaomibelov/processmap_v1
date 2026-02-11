export default function NotesPanel({ draft }) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  const notes = Array.isArray(draft?.notes) ? draft.notes : [];
  const startRole = typeof draft?.start_role === "string" ? draft.start_role : "";

  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>

      <div className="panelBody">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Actors</div>

          {roles.length === 0 ? (
            <div className="small muted">Пока нет ролей.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {roles.map((r) => (
                <div key={r.role_id} className="small">
                  <span style={{ fontWeight: 900 }}>{r.label}</span>{" "}
                  <span className="muted">({r.role_id})</span>
                </div>
              ))}
            </div>
          )}

          <div className="hr" />

          <div className="small">
            <span className="muted">start_role:</span>{" "}
            <span style={{ fontWeight: 900 }}>{startRole || "—"}</span>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Заметки</div>
          <div className="small muted" style={{ marginBottom: 8 }}>
            Кол-во: <span style={{ fontWeight: 900 }}>{notes.length}</span>
          </div>

          {notes.length === 0 ? (
            <div className="small muted">Пока заметок нет. Добавляй через нижний dock.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 360, overflow: "auto" }}>
              {notes
                .slice()
                .reverse()
                .map((n) => (
                  <div key={n.note_id} className="small">
                    <div className="muted" style={{ fontSize: 11 }}>
                      {new Date(n.ts).toLocaleString()}
                    </div>
                    <div>{n.text}</div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <button className="primaryBtn" disabled>
          Сгенерировать процесс
        </button>
        <div className="small muted" style={{ marginTop: 10 }}>
          Кнопка активируется после подключения “normalize → nodes/edges → bpmn export”.
        </div>
      </div>
    </div>
  );
}
