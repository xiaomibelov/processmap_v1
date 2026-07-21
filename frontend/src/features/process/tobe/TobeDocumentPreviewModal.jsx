import { useCallback, useState } from "react";

import Modal from "../../../shared/ui/Modal";

function toText(value) {
  return String(value || "").trim();
}

// Preview/actions modal for a To-Be document card. The iframe preview only
// renders for Google Docs with an extractable docId; everything else gets a
// placeholder plus the external-link actions.
export default function TobeDocumentPreviewModal({ doc, onClose }) {
  const [copied, setCopied] = useState(false);

  const docId = toText(doc?.docId);
  const url = toText(doc?.url);
  const title = toText(doc?.title) || "Документ";

  const editUrl = docId ? `https://docs.google.com/document/d/${docId}/edit` : url;
  const pdfUrl = docId ? `https://docs.google.com/document/d/${docId}/export?format=pdf` : "";
  const previewUrl = docId ? `https://docs.google.com/document/d/${docId}/preview` : "";

  const copyLink = useCallback(async () => {
    const link = editUrl;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard failures (permissions) are non-critical.
    }
  }, [editUrl]);

  return (
    <Modal
      open={!!doc}
      title={title}
      onClose={onClose}
      footer={(
        <div className="flex w-full items-center justify-end gap-2">
          {editUrl ? (
            <a
              className="ghostBtn h-9 px-3 text-sm inline-flex items-center"
              href={editUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="tobe-doc-open-edit"
            >
              Открыть в Google Docs
            </a>
          ) : null}
          {pdfUrl ? (
            <a
              className="ghostBtn h-9 px-3 text-sm inline-flex items-center"
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="tobe-doc-download-pdf"
            >
              Скачать PDF
            </a>
          ) : null}
          {editUrl ? (
            <button
              type="button"
              className="ghostBtn h-9 px-3 text-sm"
              onClick={copyLink}
              data-testid="tobe-doc-copy-link"
            >
              {copied ? "Скопировано" : "Копировать ссылку"}
            </button>
          ) : null}
          <button
            type="button"
            className="primaryBtn h-9 px-3 text-sm"
            onClick={onClose}
            data-testid="tobe-doc-close"
          >
            Закрыть
          </button>
        </div>
      )}
    >
      <div className="flex h-[70vh] min-h-[480px] flex-col">
        {previewUrl ? (
          <iframe
            title={title}
            src={previewUrl}
            className="h-full w-full rounded-xl border border-border bg-white"
            data-testid="tobe-doc-preview-iframe"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center rounded-xl border border-border bg-white text-sm text-muted"
            data-testid="tobe-doc-preview-unavailable"
          >
            Превью недоступно
          </div>
        )}
      </div>
    </Modal>
  );
}
