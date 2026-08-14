// ─── W4: модалка создания сессии с типом (as_is|to_be) + выбор AS IS ─────────
// Extracted from WorkspaceExplorer.jsx without logic changes (behavior-preserving move).

import React from "react";
import Button from "../../shared/ui/Button.jsx";
import SharedModal from "../../shared/ui/Modal.jsx";

export default function SessionCreateModal({ sessions = [], onClose, onSubmit }) {
  const [name, setName] = React.useState("");
  const [processLayer, setProcessLayer] = React.useState("as_is");
  const [derivedFrom, setDerivedFrom] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const inputRef = React.useRef(null);
  const trimmedName = String(name || "").trim();
  const asisList = (Array.isArray(sessions) ? sessions : []).filter(
    (x) => String(x?.process_layer || "as_is") !== "to_be",
  );

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (!trimmedName) {
      setError("Введите название сессии");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit?.({
        name: trimmedName,
        processLayer,
        derivedFrom: processLayer === "to_be" ? derivedFrom : "",
      });
      onClose?.();
    } catch (err) {
      setError(String(err?.message || err || "error"));
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
        Отмена
      </Button>
      <Button type="submit" variant="primary" form="session-create-form" data-testid="session-create-submit" disabled={busy || !trimmedName}>
        {busy ? "Создаю…" : "Создать"}
      </Button>
    </>
  );

  return (
    <SharedModal open title="Новая сессия" onClose={onClose} footer={footer} cardClassName="max-w-lg" bodyClassName="grid gap-4">
      <form id="session-create-form" className="grid gap-4" data-testid="session-create-modal" onSubmit={handleSubmit}>
        <label className="field">
          <span className="label">Название сессии</span>
          <input
            ref={inputRef}
            className="input"
            data-testid="session-create-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название сессии"
            aria-invalid={error && !trimmedName ? "true" : undefined}
          />
        </label>
        <fieldset className="field">
          <legend className="label">Тип сессии</legend>
          <div className="flex flex-wrap items-center gap-2" data-testid="session-type-row">
            <label className={`secondaryBtn inline-flex items-center gap-2 ${processLayer === "as_is" ? "isActive" : ""}`}>
              <input
                type="radio"
                name="w4_process_layer"
                data-testid="session-type-as-is"
                checked={processLayer === "as_is"}
                onChange={() => setProcessLayer("as_is")}
              />
              AS IS (как есть)
            </label>
            <label className={`secondaryBtn inline-flex items-center gap-2 ${processLayer === "to_be" ? "isActive" : ""}`}>
              <input
                type="radio"
                name="w4_process_layer"
                data-testid="session-type-to-be"
                checked={processLayer === "to_be"}
                onChange={() => setProcessLayer("to_be")}
              />
              TO BE (как будет)
            </label>
          </div>
        </fieldset>
        {processLayer === "to_be" ? (
          <label className="field" data-testid="session-asis-picker">
            <span className="label">Из какой сессии AS IS? (можно выбрать позже)</span>
            <select
              className="input"
              data-testid="session-asis-select"
              value={derivedFrom}
              onChange={(e) => setDerivedFrom(e.target.value)}
            >
              <option value="">— выбрать позже (с чистого листа) —</option>
              {asisList.map((sess) => (
                <option key={String(sess.id)} value={String(sess.id)}>
                  {String(sess.title || sess.name || "процесс")}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {error ? <div className="formError">{error}</div> : null}
      </form>
    </SharedModal>
  );
}
