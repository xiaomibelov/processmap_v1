import { useState } from "react";

export default function NotesComposer({ disabled, onAddNote }) {
  const [text, setText] = useState("");

  function submit() {
    const t = String(text || "").trim();
    if (!t) return;
    onAddNote?.(t);
    setText("");
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = !disabled && !!String(text || "").trim();

  return (
    <div className="card notesDock" style={{ marginTop: 12 }}>
      <div className="notesDockHead">
        <div style={{ fontWeight: 900 }}>Сообщения / заметки</div>
        <div className="small muted">Ctrl/⌘ + Enter — отправить</div>
      </div>

      <textarea
        className="input notesTextarea"
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
        <button className="primaryBtn" onClick={submit} disabled={!canSend}>
          Отправить
        </button>
      </div>
    </div>
  );
}
