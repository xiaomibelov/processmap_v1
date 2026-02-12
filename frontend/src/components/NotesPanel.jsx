import { useMemo, useState } from "react";

export default function NotesPanel({ draft, onAddNote, onGenerate, generateDisabled, generateHint, backendStatus }) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  const notes = Array.isArray(draft?.notes) ? draft.notes : [];
  const startRole = typeof draft?.start_role === "string" ? draft.start_role : "";
  const [text, setText] = useState("");

  const badge = useMemo(() => {
    if (backendStatus === "ok") return <span className="badge ok">API OK</span>;
    if (backendStatus === "fail") return <span className="badge err">API FAIL</span>;
    return <span className="badge">API …</span>;
  }, [backendStatus]);

  return (
    <div className="panel">
      <div className="panelHead">Сессия {badge}</div>

      <div className="panelBody">
        <div className="card">
          <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Акторы</div>
          {roles.length === 0 ? (
            <div className="small muted">Роли ещё не заданы.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {roles.map((r) => (
                <div key={r.role_id || r} className="small">
                  <span style={{ fontWeight: 900 }}>{r.label || r}</span>{" "}
                  {r.role_id ? <span className="muted">({r.role_id})</span> : null}
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

        <div style={{ height: 10 }} />

        <button className="primaryBtn" onClick={onGenerate} disabled={!!generateDisabled}>
          Сгенерировать процесс
        </button>
        {generateHint ? <div className="small muted" style={{ marginTop: 8 }}>{generateHint}</div> : null}

        <div style={{ height: 12 }} />

        <div className="card">
          <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Сообщения / заметки</div>

          {notes.length === 0 ? (
            <div className="small muted">Пока заметок нет.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto" }}>
              {notes.slice().reverse().slice(0, 50).map((n) => (
                <div key={n.note_id || `${n.ts}_${n.text}`} className="small">
                  <div className="muted" style={{ fontSize: 11 }}>{n.ts ? new Date(n.ts).toLocaleString() : ""}</div>
                  <div>{n.text}</div>
                </div>
              ))}
            </div>
          )}

          <div className="hr" />

          <div className="inputRow">
            <input
              className="input"
              placeholder="Добавить заметку…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  const t = text.trim();
                  if (!t) return;
                  onAddNote(t);
                  setText("");
                }
              }}
            />
            <button className="secondaryBtn" onClick={() => {
              const t = text.trim();
              if (!t) return;
              onAddNote(t);
              setText("");
            }}>
              Отправить
            </button>
          </div>

          <div className="small muted" style={{ marginTop: 8 }}>Enter+Ctrl/⌘ — отправить.</div>
        </div>
      </div>
    </div>
  );
}
