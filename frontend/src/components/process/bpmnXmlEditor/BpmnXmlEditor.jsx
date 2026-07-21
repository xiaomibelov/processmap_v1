import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { validateBpmnXmlText } from "../../../features/process/bpmn/stage/runtimeHelpers/bpmnStagePureHelpers";
import { prettyPrintXml } from "./prettyPrintXml";
import { removeDuplicates } from "./xmlDuplicateDetector";
import "./BpmnXmlEditor.css";

const BpmnXmlCodeEditor = lazy(() => import("./BpmnXmlCodeEditor"));
const BpmnXmlStructureView = lazy(() => import("./BpmnXmlStructureView"));

function useDebouncedCallback(callback, delay) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const schedule = useCallback(
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const flushAndRun = useCallback(
    (...args) => {
      flush();
      callbackRef.current(...args);
    },
    [flush],
  );

  useEffect(() => () => flush(), [flush]);

  return { schedule, flush, flushAndRun };
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function countLines(text) {
  return String(text || "").split("\n").length;
}

/**
 * Container component for the BPMN XML editor.
 *
 * Props:
 * - xmlDraft: string (current draft from parent)
 * - xml: string (last saved XML, used as original for dirty detection)
 * - xmlDirty?: boolean (optional external dirty flag)
 * - xmlSaveBusy: boolean
 * - onChange: (value: string) => void
 * - onSave: (value?: string) => Promise | void
 * - onReset: () => void
 */
export default function BpmnXmlEditor({
  xmlDraft = "",
  xml = "",
  xmlDirty: externalDirty,
  xmlSaveBusy = false,
  fullPage = false,
  onChange,
  onSave,
  onReset,
}) {
  const [editorValue, setEditorValue] = useState(xmlDraft);
  const [validationError, setValidationError] = useState("");
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [structureOpen, setStructureOpen] = useState(true);
  const [dupScan, setDupScan] = useState({ status: "idle", count: 0 });
  const editorRef = useRef(null);

  // Keep editor in sync with external resets / tab loads / saves.
  useEffect(() => {
    setEditorValue(xmlDraft);
  }, [xmlDraft]);

  const { schedule: debouncedOnChange, flush: flushDebounce, flushAndRun } = useDebouncedCallback(
    (value) => {
      onChange?.(value);
    },
    300,
  );

  const isDirty = useMemo(() => editorValue !== xml, [editorValue, xml]);
  const isInvalid = Boolean(validationError);

  const handleEditorChange = useCallback(
    (value) => {
      setEditorValue(value);
      setValidationError(validateBpmnXmlText(value));
      debouncedOnChange(value);
    },
    [debouncedOnChange],
  );

  const handleFormat = useCallback(() => {
    if (!editorValue.trim()) return;
    try {
      const formatted = prettyPrintXml(editorValue);
      handleEditorChange(formatted);
    } catch (err) {
      setValidationError(String(err?.message || "Не удалось форматировать: XML невалиден"));
    }
  }, [editorValue, handleEditorChange]);

  const handleSave = useCallback(() => {
    flushAndRun(editorValue);
    if (validateBpmnXmlText(editorValue)) return;
    onSave?.(editorValue);
  }, [flushAndRun, editorValue, onSave]);

  const handleReset = useCallback(() => {
    flushDebounce();
    onReset?.();
  }, [flushDebounce, onReset]);

  const handleCursorActivity = useCallback((line, col) => {
    setCursor({ line, col });
  }, []);

  const handleScanDuplicates = useCallback(() => {
    const count = editorRef.current?.highlightDuplicates?.() ?? 0;
    setDupScan({ status: "scanned", count });
  }, []);

  const handleRemoveDuplicates = useCallback(() => {
    if (dupScan.status !== "scanned" || dupScan.count <= 0) return;
    if (dupScan.count > 5) {
      const confirmed = window.confirm(`Найдено дублей: ${dupScan.count}. Удалить их из XML?`);
      if (!confirmed) return;
    }
    const { xml, removedCount } = removeDuplicates(editorValue);
    if (removedCount > 0 && xml !== editorValue) {
      // Single full-range dispatch in the code editor; the existing
      // change pipeline (updateListener -> onChange -> validation/save)
      // picks it up just like a manual edit or "Форматировать XML".
      editorRef.current?.replaceContent?.(xml);
    }
    editorRef.current?.clearDuplicateHighlights?.();
    setDupScan({ status: "removed", count: removedCount });
  }, [dupScan, editorValue]);

  const handleStructureSelect = useCallback((line) => {
    editorRef.current?.scrollToLine?.(line);
  }, []);

  const dupBadge = useMemo(() => {
    if (dupScan.status === "removed") {
      return { text: `✅ Дубли удалены (${dupScan.count})`, className: "clean" };
    }
    if (dupScan.status === "scanned") {
      return dupScan.count > 0
        ? { text: `Дублей: ${dupScan.count}`, className: "has-dups" }
        : { text: "✅ Дублей нет", className: "clean" };
    }
    return null;
  }, [dupScan]);

  const statusText = useMemo(() => {
    if (xmlSaveBusy) return "Сохранение…";
    if (isInvalid) return "Ошибка валидации";
    if (isDirty || externalDirty) return "Изменено";
    return "Синхронизировано";
  }, [xmlSaveBusy, isInvalid, isDirty, externalDirty]);

  const statusClass = useMemo(() => {
    if (xmlSaveBusy) return "busy";
    if (isInvalid) return "error";
    if (isDirty || externalDirty) return "dirty";
    return "saved";
  }, [xmlSaveBusy, isInvalid, isDirty, externalDirty]);

  const sizeBytes = useMemo(() => new Blob([editorValue]).size, [editorValue]);

  const rootClass = ["bpmnXmlEditor", fullPage ? "bpmnXmlEditor--fullPage" : ""].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <div className="bpmnXmlEditorToolbar">
        <span className={`bpmnXmlEditorStatus ${statusClass}`}>{statusText}</span>
        <div className="bpmnXmlEditorActions">
          <button
            type="button"
            className="bpmnXmlEditorBtn secondary"
            onClick={() => setStructureOpen((v) => !v)}
            disabled={xmlSaveBusy}
            title={structureOpen ? "Скрыть структуру" : "Показать структуру"}
          >
            {structureOpen ? "Скрыть структуру" : "Структура"}
          </button>
          <button
            type="button"
            className="bpmnXmlEditorBtn secondary"
            onClick={handleFormat}
            disabled={!editorValue.trim() || xmlSaveBusy}
            title="Форматировать XML"
          >
            Форматировать XML
          </button>
          <button
            type="button"
            className="bpmnXmlEditorBtn secondary"
            onClick={handleReset}
            disabled={xmlSaveBusy || (!isDirty && !externalDirty)}
            title="Вернуть последнее сохранённое состояние XML"
          >
            Сбросить
          </button>
          <button
            type="button"
            className="bpmnXmlEditorBtn secondary"
            onClick={handleScanDuplicates}
            disabled={!editorValue.trim() || xmlSaveBusy}
            title="Найти и подсветить дублирующиеся элементы XML"
          >
            Подсветить дубли
          </button>
          {dupBadge ? (
            <span className={`bpmnXmlEditorDupBadge ${dupBadge.className}`}>{dupBadge.text}</span>
          ) : null}
          <button
            type="button"
            className="bpmnXmlEditorBtn secondary"
            onClick={handleRemoveDuplicates}
            disabled={dupScan.status !== "scanned" || dupScan.count <= 0 || xmlSaveBusy}
            title="Удалить дублирующиеся элементы XML (первое вхождение сохраняется)"
          >
            Удалить дубли
          </button>
          <button
            type="button"
            className="bpmnXmlEditorBtn primary"
            onClick={handleSave}
            disabled={xmlSaveBusy || (!isDirty && !externalDirty) || isInvalid}
            title="Сохранить XML в сессию"
          >
            {xmlSaveBusy ? "Сохранение…" : "Сохранить XML"}
          </button>
        </div>
      </div>

      {isInvalid ? (
        <div className="bpmnXmlEditorValidationBanner" role="alert">
          {validationError}
        </div>
      ) : null}

      <div className="bpmnXmlEditorWorkspace">
        <div className="bpmnXmlEditorCodeHost">
          <Suspense fallback={<div className="bpmnXmlEditorFallback">Загрузка редактора…</div>}>
            <BpmnXmlCodeEditor
              ref={editorRef}
              value={editorValue}
              onChange={handleEditorChange}
              onSave={handleSave}
              onCursorActivity={handleCursorActivity}
              readOnly={xmlSaveBusy}
            />
          </Suspense>
        </div>
        {structureOpen ? (
          <Suspense fallback={null}>
            <BpmnXmlStructureView value={editorValue} onSelectLine={handleStructureSelect} />
          </Suspense>
        ) : null}
      </div>

      <div className="bpmnXmlEditorStatusBar">
        <span>Строка {cursor.line}, Колонка {cursor.col}</span>
        <span>{formatBytes(sizeBytes)} | {countLines(editorValue)} строк</span>
        <span className={`bpmnXmlEditorStatusBarLabel ${statusClass}`}>{statusText}</span>
      </div>
    </div>
  );
}
