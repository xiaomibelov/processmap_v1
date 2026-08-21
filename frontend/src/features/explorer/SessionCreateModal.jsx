// ─── W4: модалка создания сессии с типом (as_is|to_be) + выбор AS IS ─────────
// Extracted from WorkspaceExplorer.jsx without logic changes (behavior-preserving move).
// P6 [Г]: optional dropzone .bpmn/.xml — после POST create вызывается upload,
// транзиентные стадии «Создание… → Загрузка… → Обработка… → Готово / Ошибка + retry»
// (retry перевыкладывает файл в ту же сессию, без дубликата).

import React from "react";
import Button from "../../shared/ui/Button.jsx";
import SharedModal from "../../shared/ui/Modal.jsx";
import {
  BPMN_UPLOAD_ACCEPT,
  stripBpmnExtension,
  uploadStageLabel,
  validateBpmnUploadFile,
} from "./bpmnUploadFlow.js";

export default function SessionCreateModal({ sessions = [], onClose, onSubmit, onUploadFile }) {
  const [name, setName] = React.useState("");
  const [processLayer, setProcessLayer] = React.useState("as_is");
  const [derivedFrom, setDerivedFrom] = React.useState("");
  const [file, setFile] = React.useState(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [stage, setStage] = React.useState("idle");
  const [createdSessionId, setCreatedSessionId] = React.useState("");
  const inputRef = React.useRef(null);
  const trimmedName = String(name || "").trim();
  const asisList = (Array.isArray(sessions) ? sessions : []).filter(
    (x) => String(x?.process_layer || "as_is") !== "to_be",
  );

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function acceptFile(candidate) {
    if (!candidate) return;
    const verdict = validateBpmnUploadFile(candidate);
    if (!verdict.ok) {
      setFile(null);
      setError(verdict.error);
      return;
    }
    setError("");
    setFile(candidate);
    if (!trimmedName) setName(stripBpmnExtension(candidate.name));
  }

  async function runUpload(sessionId, uploadFile) {
    setStage("uploading");
    const up = await onUploadFile?.(sessionId, uploadFile);
    if (!up?.ok) throw new Error(up?.error || "Не удалось загрузить файл");
    setStage("processing");
    setStage("done");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (!trimmedName) {
      setError("Введите название сессии");
      inputRef.current?.focus();
      return;
    }
    if (file) {
      const verdict = validateBpmnUploadFile(file);
      if (!verdict.ok) {
        setError(verdict.error);
        return;
      }
    }
    setBusy(true);
    setError("");
    setStage("creating");
    try {
      const created = await onSubmit?.({
        name: trimmedName,
        processLayer,
        derivedFrom: processLayer === "to_be" ? derivedFrom : "",
      });
      const sessionId = String(created?.sessionId || "").trim();
      if (file && sessionId && typeof onUploadFile === "function") {
        setCreatedSessionId(sessionId);
        await runUpload(sessionId, file);
      } else {
        setStage("done");
      }
      onClose?.();
    } catch (err) {
      setStage("error");
      setError(String(err?.message || err || "error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryUpload() {
    if (busy || !createdSessionId || !file || typeof onUploadFile !== "function") return;
    setBusy(true);
    setError("");
    try {
      await runUpload(createdSessionId, file);
      onClose?.();
    } catch (err) {
      setStage("error");
      setError(String(err?.message || err || "error"));
    } finally {
      setBusy(false);
    }
  }

  const stageLabel = uploadStageLabel(stage);
  const footer = (
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
        Отмена
      </Button>
      <Button type="submit" variant="primary" form="session-create-form" data-testid="session-create-submit" disabled={busy || !trimmedName}>
        {busy ? (stageLabel || "Создаю…") : "Создать"}
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
        <div className="field">
          <span className="label">BPMN-файл (необязательно, .bpmn/.xml, до 20 МБ)</span>
          <div
            className={`flex min-h-[64px] items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs transition-colors ${
              dragOver ? "border-accent bg-accentSoft/40 text-fg" : "border-border bg-panel2/30 text-muted"
            }`}
            data-testid="session-create-dropzone"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              acceptFile(e.dataTransfer?.files?.[0]);
            }}
          >
            {file ? (
              <span className="truncate text-fg" title={file.name} data-testid="session-create-file-name">
                📎 {file.name}
              </span>
            ) : (
              <span>Перетащите .bpmn/.xml сюда или</span>
            )}
            <label className="secondaryBtn h-7 min-h-0 cursor-pointer px-2.5 text-xs inline-flex items-center">
              {file ? "Заменить" : "Выбрать файл"}
              <input
                type="file"
                accept={BPMN_UPLOAD_ACCEPT}
                className="hidden"
                data-testid="session-create-file"
                onChange={(e) => {
                  acceptFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {file ? (
              <button
                type="button"
                className="text-muted hover:text-fg"
                title="Убрать файл"
                data-testid="session-create-file-clear"
                onClick={() => setFile(null)}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
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
        {stageLabel ? (
          <div className="text-xs text-muted" data-testid="session-create-stage" data-stage={stage}>
            {stageLabel}
          </div>
        ) : null}
        {error ? (
          <div className="formError" data-testid="session-create-error">
            {error}
            {stage === "error" && createdSessionId && file ? (
              <button
                type="button"
                className="secondaryBtn ml-2 h-6 min-h-0 px-2 text-xs"
                data-testid="session-create-retry"
                onClick={handleRetryUpload}
                disabled={busy}
              >
                Повторить загрузку
              </button>
            ) : null}
          </div>
        ) : null}
      </form>
    </SharedModal>
  );
}
