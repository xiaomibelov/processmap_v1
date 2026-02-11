import { useMemo, useState } from "react";

export default function NodeCopilotCard({
  element,
  roles,
  meta,
  onSetRole,
  onAddQuestion,
  onRemoveQuestion,
  onAddNote,
  onClose,
}) {
  const [qText, setQText] = useState("");
  const [noteText, setNoteText] = useState("");

  const title = useMemo(() => {
    const n = element?.name || "";
    return n.trim() ? n.trim() : (element?.id || "Node");
  }, [element]);

  const type = element?.type || "";
  const roleId = meta?.role_id || "";

  return (
    <div className="card" style={{ width: 340, maxWidth: 360 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 900 }}>AI Copilot: вопросы</div>
        <div className="spacer" />
        <button className="btn" onClick={onClose} title="Закрыть">×</button>
      </div>

      <div className="small muted" style={{ marginTop: 6 }}>
        <span style={{ fontWeight: 900 }}>{title}</span>{" "}
        <span className="muted">· {type}</span>
      </div>

      <div className="hr" />

      <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Роль (ответственный)</div>
      <select
        className="input"
        value={roleId}
        onChange={(e) => onSetRole(element.id, e.target.value)}
      >
        <option value="">— не выбрано —</option>
        {Array.isArray(roles) ? roles.map((r) => (
          <option key={r.role_id} value={r.role_id}>
            {r.label} ({r.role_id})
          </option>
        )) : null}
      </select>

      <div className="hr" />

      <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Вопрос</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="Например: что считается входом/выходом шага?"
        />
        <button
          className="primaryBtn"
          style={{ whiteSpace: "nowrap" }}
          onClick={() => {
            onAddQuestion(element.id, qText);
            setQText("");
          }}
        >
          + Добавить
        </button>
      </div>

      {meta?.questions?.length ? (
        <div style={{ marginTop: 10, display: "grid", gap: 8, maxHeight: 160, overflow: "auto" }}>
          {meta.questions.slice().reverse().map((q) => (
            <div key={q.question_id} className="small" style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="muted" style={{ fontSize: 11 }}>{new Date(q.ts).toLocaleString()}</div>
                <div>{q.text}</div>
              </div>
              <button className="btn" onClick={() => onRemoveQuestion(element.id, q.question_id)} title="Удалить">🗑</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="small muted" style={{ marginTop: 10 }}>
          Вопросов пока нет.
        </div>
      )}

      <div className="hr" />

      <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Быстрая заметка по узлу</div>
      <textarea
        className="input"
        style={{ height: 74, resize: "vertical" }}
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="Коротко: условия, нюансы, исключения, контроль качества…"
      />
      <button
        className="primaryBtn"
        style={{ marginTop: 8, width: "100%" }}
        onClick={() => {
          const t = (noteText || "").trim();
          if (!t) return;
          onAddNote(`[node:${element.id}] ${t}`);
          setNoteText("");
        }}
      >
        В заметки
      </button>
    </div>
  );
}
