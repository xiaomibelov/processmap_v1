export default function NoteComposer({ text, onText, disabled, onSubmit }) {
  function submit() {
    if (typeof onSubmit === "function") onSubmit();
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  }

  const trimmed = String(text || "").trim();
  const isDisabled = !!disabled;
  const canSend = !isDisabled && !!trimmed;

  return (
    <div className="card notesDock" style={{ marginTop: 12 }}>
      <div className="notesDockHead">
        <div style={{ fontWeight: 900 }}>Сообщения / заметки</div>
        <div className="small muted">Ctrl/⌘ + Enter — отправить</div>
      </div>

      <textarea
        className="input"
        rows={5}
        placeholder={
          isDisabled
            ? "Сначала заполни роли и start_role."
            : "Пиши заметку по процессу: условия, исключения, оборудование, контроль качества…"
        }
        value={text || ""}
        onChange={(e) => onText?.(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={isDisabled}
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
