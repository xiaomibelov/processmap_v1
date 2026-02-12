import { useMemo, useState } from "react";

export default function NotesPanel({ draft, onAddNote, disabled }) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  const notes = Array.isArray(draft?.notes) ? draft.notes : [];
  const startRole = typeof draft?.start_role === "string" ? draft.start_role : "";

  const [text, setText] = useState("");

  const lastNotes = useMemo(() => {
    const arr = notes.slice().reverse();
    return arr.slice(0, 6);
  }, [notes]);

  function submit() {
    const t = String(text || "").trim();
    if (!t) return;
    if (typeof onAddNote === "function") onAddNote(t);
    setText("");
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>

      <div className="panelBody">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Акторы</div>

          {roles.length === 0 ? (
            <div className="small muted">Пока нет ролей.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {roles.map((r) => (
                <div key={r.role_id || r} className="small">
                  <span style={{ fontWeight: 900 }}>{r.label || r}</span>{" "}
                  <span className="muted">({r.role_id || r})</span>
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
            <div className="small muted">Пока заметок нет.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 210, overflow: "auto" }}>
              {lastNotes.map((n) => (
                <div key={n.note_id || n.ts} className="small">
                  <div className="muted" style={{ fontSize: 11 }}>
                    {n.ts ? new Date(n.ts).toLocaleString() : ""}
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

        <div className="card notesDock" style={{ marginTop: 12 }}>
          <div className="notesDockHead">
            <div style={{ fontWeight: 900 }}>Сообщения / заметки</div>
            <div className="small muted">Ctrl/⌘ + Enter — отправить</div>
          </div>

          <textarea
            className="input"
            rows={5}
            placeholder={
              disabled
                ? "Сначала заполни роли и start_role."
                : "Пиши заметку по процессу: условия, исключения, оборудование, контроль качества…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!!disabled}
            style={{ resize: "vertical", minHeight: 92 }}
          />

          <div className="notesDockActions">
            <button className="primaryBtn" onClick={submit} disabled={!!disabled || !String(text || "").trim()}>
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
