import { useCallback, useState } from "react";

import { resolveTobeDocumentUrls } from "./tobeDocumentUrls.js";

// Shared footer actions for the To-Be document preview popover and modal:
// open externally, download PDF (Google Docs only), copy link.
export default function TobeDocumentActions({ doc, size = "md" }) {
  const [copied, setCopied] = useState(false);
  const { isGoogleDoc, openUrl, pdfUrl } = resolveTobeDocumentUrls(doc);

  const copyLink = useCallback(async () => {
    if (!openUrl) return;
    try {
      await navigator.clipboard.writeText(openUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard failures (permissions) are non-critical.
    }
  }, [openUrl]);

  const btnCls = size === "sm" ? "ghostBtn h-8 px-2 text-xs" : "ghostBtn h-9 px-3 text-sm";

  return (
    <>
      {openUrl ? (
        <a
          className={`${btnCls} inline-flex items-center`}
          href={openUrl}
          target="_blank"
          rel="noreferrer"
          data-testid="tobe-doc-open-edit"
        >
          {isGoogleDoc ? "Открыть в Google Docs" : "Открыть"}
        </a>
      ) : null}
      {pdfUrl ? (
        <a
          className={`${btnCls} inline-flex items-center`}
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          data-testid="tobe-doc-download-pdf"
        >
          Скачать PDF
        </a>
      ) : null}
      {openUrl ? (
        <button
          type="button"
          className={btnCls}
          onClick={copyLink}
          data-testid="tobe-doc-copy-link"
        >
          {copied ? "Скопировано" : "Копировать ссылку"}
        </button>
      ) : null}
    </>
  );
}
