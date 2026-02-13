import { useMemo, useState } from "react";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

export default function NotesPanel({
  draft,
  onGenerate,
  generating,
  onAddNote,
  addNoteDisabled,
  errorText,
}) {
  const roles = Array.isArray(draft?.roles) ? draft.roles : [];
  const notes = Array.isArray(draft?.notes) ? draft.notes : [];
  const startRole = typeof draft?.start_role === "string" ? draft.start_role : "";
  const sessionId = typeof draft?.session_id === "string" ? draft.session_id : "";

  const canGenerate = !!sessionId && !isLocalSessionId(sessionId);

  const [text, setText] = useState("");

  const notesRev = useMemo(() => notes.slice().reverse(), [notes]);

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

        <button
          className="primaryBtn"
          disabled={!canGenerate || generating}
          onClick={canGenerate ? onGenerate : undefined}
          title={
            !canGenerate
              ? "Создай API-сессию (кнопка “New API”), чтобы генерировать процесс на бэке"
              : ""
          }
        >
          {generating ? "Генерация…" : "Сгенерировать процесс"}
        </button>

        {errorText ? (
          <div
            className="card"
            style={{
              marginTop: 10,
              borderColor: "rgba(255,77,77,.35)",
              background: "rgba(255,77,77,.08)",
            }}
          >
            <div className="small" style={{ fontWeight: 900, marginBottom: 4 }}>
              Ошибка
            </div>
            <div className="small">{errorText}</div>
          </div>
        ) : null}

        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Заметки</div>

          <div className="inputRow" style={{ alignItems: "stretch" }}>
            <textarea
              className="input"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Коротко: что важно уточнить, что проверить, какие допуски…"
              style={{ resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              className="btn"
              disabled={addNoteDisabled || !text.trim()}
              onClick={() => {
                const t = text.trim();
                if (!t) return;
                onAddNote?.(t);
                setText("");
              }}
            >
              Добавить
            </button>

            <div className="small muted" style={{ alignSelf: "center" }}>
              Кол-во: <span style={{ fontWeight: 900 }}>{notes.length}</span>
            </div>
          </div>

          {notes.length === 0 ? (
            <div className="small muted" style={{ marginTop: 10 }}>
              Пока заметок нет.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
                marginTop: 12,
                maxHeight: 340,
                overflow: "auto",
              }}
            >
              {notesRev.slice(0, 20).map((n) => (
                <div key={n.note_id} className="noteLine">
                  <div className="muted" style={{ fontSize: 11 }}>
                    {n?.ts ? new Date(n.ts).toLocaleString() : "—"}
                  </div>
                  <div className="small">{n.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!canGenerate ? (
          <div className="small muted" style={{ marginTop: 12 }}>
            Подсказка: для генерации процесса нужна API-сессия (TopBar → “New API”).
          </div>
        ) : null}
      </div>
    </div>
  );
}
