import Modal from "../../../shared/ui/Modal";

import TobeDocumentActions from "./TobeDocumentActions.jsx";
import { resolveTobeDocumentUrls } from "./tobeDocumentUrls.js";

function toText(value) {
  return String(value || "").trim();
}

// Expanded (second-level) To-Be document preview: 80vw x 80vh centered modal
// with backdrop (shared Modal handles Escape / backdrop click / ×). Reached
// via «Расширить» in the popover or double-click on a canvas card;
// «Свернуть» returns to the popover state.
export default function TobeDocumentPreviewModal({ doc, anchorElementName = "", onCollapse, onClose }) {
  const url = toText(doc?.url);
  const title = toText(doc?.title) || "Без названия";
  const anchorName = toText(anchorElementName);
  const { previewUrl } = resolveTobeDocumentUrls(doc);

  // Optional metadata line — rendered only when the data actually exists.
  const addedBy = toText(doc?.createdBy);
  const createdAt = toText(doc?.createdAt);
  const metadata = [addedBy, createdAt].filter(Boolean).join(" · ");

  return (
    <Modal
      open={!!doc}
      title={anchorName ? `${title} — ${anchorName}` : title}
      onClose={onClose}
      cardClassName="!h-[80vh] !max-h-[80vh] !w-[80vw] !max-w-[80vw]"
      footer={(
        <div className="flex w-full items-center justify-end gap-2">
          {typeof onCollapse === "function" ? (
            <button
              type="button"
              className="ghostBtn h-9 px-3 text-sm"
              onClick={onCollapse}
              data-testid="tobe-doc-collapse"
            >
              Свернуть
            </button>
          ) : null}
          <TobeDocumentActions doc={doc} />
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
      <div className="flex h-full min-h-0 flex-col gap-2">
        {metadata ? (
          <div className="text-xs text-muted" data-testid="tobe-doc-metadata">{metadata}</div>
        ) : null}
        {previewUrl ? (
          <iframe
            title={title}
            src={previewUrl}
            className="min-h-0 w-full flex-1 rounded-xl border border-border bg-white"
            data-testid="tobe-doc-preview-iframe"
          />
        ) : (
          <div
            className="flex min-h-0 w-full flex-1 items-center justify-center rounded-xl border border-border bg-white text-sm text-muted"
            data-testid="tobe-doc-preview-unavailable"
          >
            {url ? <span className="break-all px-4 text-center">{url}</span> : "Превью недоступно"}
          </div>
        )}
      </div>
    </Modal>
  );
}
