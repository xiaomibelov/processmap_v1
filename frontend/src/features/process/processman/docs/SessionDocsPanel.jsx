import { useEffect, useRef, useState } from "react";
import { ru } from "../../../../shared/i18n/ru";
import Modal from "../../../../shared/ui/Modal";
import {
  apiSessionDocsAttach,
  apiSessionDocsDetach,
  apiSessionDocsGet,
  apiSessionDocsList,
} from "../../../../lib/api";

// feature/session-doc-attachments — «Документы сессии» в шапке панели PROCESSMAN.
// Сворачиваемая секция; список грузится ТОЛЬКО по открытию (клик пользователя,
// никаких авто-fetch из useEffect — контракт processmanTokenEconomy.test.mjs).
// Attach — скрытый file input; detach — двухшаговое подтверждение в строке
// (нативный confirm запрещён); «открыть» — Modal с полным текстом документа.
// Тестовый шов: api-функции можно подменить пропом (моки api-layer, не fetch).
const t = ru.processman;

const DEFAULT_DOCS_API = {
  list: apiSessionDocsList,
  attach: apiSessionDocsAttach,
  detach: apiSessionDocsDetach,
  get: apiSessionDocsGet,
};

function errorTextOf(result, fallback) {
  return String(result?.error || result?.data?.detail || "").trim() || fallback;
}

function formatKb(sizeBytes) {
  const bytes = Number(sizeBytes || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 КБ";
  return `${(bytes / 1024).toFixed(1)} КБ`;
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default function SessionDocsPanel({ sessionId, api = DEFAULT_DOCS_API }) {
  const sid = String(sessionId || "").trim();
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState(null); // null = список ещё не загружался
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [attachError, setAttachError] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [confirmDetachId, setConfirmDetachId] = useState("");
  const [toast, setToast] = useState("");
  const [viewer, setViewer] = useState(null); // { docId, filename, text, loading, error }
  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  // Таймер toast'а не должен переживать размонтирование (тесты/переключение
  // сессии): иначе setState сработает на разобранном дереве. useEffect без
  // сети — контракт токен-экономии не нарушается.
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = (text) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 3000);
  };

  const loadDocs = async () => {
    if (!sid) return;
    setLoading(true);
    setListError("");
    const result = await api.list(sid);
    setLoading(false);
    if (!result.ok) {
      setListError(errorTextOf(result, t.docsError));
      setDocs([]);
      return;
    }
    setDocs(Array.isArray(result.docs) ? result.docs : []);
  };

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    // Единственный триггер загрузки списка — явное открытие секции.
    if (next && docs === null) void loadDocs();
  };

  const handleAttachClick = () => {
    setAttachError("");
    fileInputRef.current?.click?.();
  };

  const handleFileChange = async (event) => {
    const file = event?.target?.files?.[0];
    event.target.value = ""; // повторный выбор того же файла снова дёргает onChange
    if (!file || !sid) return;
    setAttaching(true);
    setAttachError("");
    const result = await api.attach(sid, file);
    setAttaching(false);
    if (!result.ok) {
      setAttachError(errorTextOf(result, t.docsAttachFailed));
      return;
    }
    showToast(t.docsAttachedToast);
    await loadDocs();
  };

  const handleDetachRequest = (docId) => {
    setConfirmDetachId(String(docId || ""));
  };

  const handleDetachConfirm = async () => {
    const docId = confirmDetachId;
    setConfirmDetachId("");
    if (!docId || !sid) return;
    const result = await api.detach(sid, docId);
    if (!result.ok) {
      setListError(errorTextOf(result, t.docsError));
      return;
    }
    showToast(t.docsDetachedToast);
    setDocs((prev) => (Array.isArray(prev) ? prev : []).filter((d) => String(d?.docId || "") !== docId));
    setViewer((prev) => (prev && prev.docId === docId ? null : prev));
  };

  const handleOpenDoc = async (doc) => {
    const docId = String(doc?.docId || "");
    if (!docId || !sid) return;
    setViewer({ docId, filename: String(doc?.filename || ""), text: "", loading: true, error: "" });
    const result = await api.get(sid, docId);
    setViewer((prev) => {
      if (!prev || prev.docId !== docId) return prev;
      if (!result.ok) return { ...prev, loading: false, error: errorTextOf(result, t.docsError) };
      return { ...prev, loading: false, filename: String(result.filename || prev.filename), text: String(result.contentText || "") };
    });
  };

  const listLoaded = Array.isArray(docs);
  const docsCount = listLoaded ? docs.length : 0;

  return (
    <div className={`pm-processman-docs${open ? " pm-processman-docs--open" : ""}`} data-testid="processman-docs-panel">
      <button
        type="button"
        className="pm-processman-docs__toggle"
        data-testid="processman-docs-toggle"
        aria-expanded={open}
        onClick={handleToggle}
      >
        <span className="pm-processman-docs__chevron" aria-hidden="true"><IconChevron /></span>
        <span className="pm-processman-docs__title">{t.docsTitle}</span>
        {listLoaded ? <span className="pm-processman-docs__count" data-testid="processman-docs-count">{docsCount}</span> : null}
      </button>

      {open ? (
        <div className="pm-processman-docs__body">
          <div className="pm-processman-docs__toolbar">
            <button
              type="button"
              className="pm-processman-docs__attach"
              data-testid="processman-docs-attach"
              disabled={attaching || !sid}
              onClick={handleAttachClick}
            >
              {attaching ? t.docsAttaching : t.docsAttach}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="pm-processman-docs__file-input"
              data-testid="processman-docs-file-input"
              accept=".md,.txt,.text,.doc,.docx"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => { void handleFileChange(e); }}
            />
          </div>

          {attachError ? (
            <div className="pm-processman-docs__error" data-testid="processman-docs-attach-error">{attachError}</div>
          ) : null}

          {loading ? <div className="pm-processman-docs__hint" data-testid="processman-docs-loading">{t.docsLoading}</div> : null}

          {!loading && listError ? (
            <div className="pm-processman-docs__error" data-testid="processman-docs-error">
              <span>{listError}</span>
              <button type="button" className="pm-processman-msg__secondary" data-testid="processman-docs-retry" onClick={() => { void loadDocs(); }}>
                {t.retryLabel}
              </button>
            </div>
          ) : null}

          {!loading && !listError && listLoaded && docs.length === 0 ? (
            <div className="pm-processman-docs__hint" data-testid="processman-docs-empty">{t.docsEmpty}</div>
          ) : null}

          {!loading && !listError && docs.length > 0 ? (
            <ul className="pm-processman-docs__list">
              {docs.map((doc) => {
                const docId = String(doc?.docId || "");
                const confirming = confirmDetachId === docId && docId !== "";
                return (
                  <li className="pm-processman-docs__item" data-testid="processman-docs-item" key={docId || doc?.filename}>
                    <span className="pm-processman-docs__ext">{String(doc?.ext || "").toUpperCase()}</span>
                    <span className="pm-processman-docs__name" title={String(doc?.filename || "")}>{String(doc?.filename || "—")}</span>
                    <span className="pm-processman-docs__size">{formatKb(doc?.sizeBytes)}</span>
                    <button
                      type="button"
                      className="pm-processman-docs__open"
                      data-testid="processman-docs-open"
                      onClick={() => { void handleOpenDoc(doc); }}
                    >
                      {t.docsOpen}
                    </button>
                    {confirming ? (
                      <span className="pm-processman-docs__confirm">
                        <button
                          type="button"
                          className="pm-processman-docs__confirm-yes"
                          data-testid="processman-docs-detach-confirm"
                          onClick={() => { void handleDetachConfirm(); }}
                        >
                          {t.docsDetachConfirm}
                        </button>
                        <button
                          type="button"
                          className="pm-processman-docs__confirm-no"
                          data-testid="processman-docs-detach-cancel"
                          onClick={() => setConfirmDetachId("")}
                        >
                          {t.docsDetachCancel}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="pm-processman-docs__detach"
                        data-testid="processman-docs-detach"
                        aria-label={`${t.docsDetachAria}: ${String(doc?.filename || "")}`}
                        onClick={() => handleDetachRequest(docId)}
                      >
                        {t.docsDetach}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {toast ? <div className="pm-processman-docs__toast" data-testid="processman-docs-toast">{toast}</div> : null}
        </div>
      ) : null}

      <Modal
        open={!!viewer}
        title={viewer?.filename || t.docsTitle}
        onClose={() => setViewer(null)}
        cardClassName="pm-processman-docs__modal"
        bodyClassName="pm-processman-docs__modal-body"
      >
        {viewer?.loading ? <div className="pm-processman-docs__hint">{t.docsLoading}</div> : null}
        {viewer?.error ? <div className="pm-processman-docs__error">{viewer.error}</div> : null}
        {!viewer?.loading && !viewer?.error ? (
          <pre className="pm-processman-docs__pre" data-testid="processman-docs-viewer-text">{viewer?.text}</pre>
        ) : null}
      </Modal>
    </div>
  );
}
