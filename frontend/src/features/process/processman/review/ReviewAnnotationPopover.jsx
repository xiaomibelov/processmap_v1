import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ru } from "../../../../shared/i18n/ru";
import { normalizeSeverity } from "./reviewSegments";

// feature/session-doc-attachments — поповер аннотации ревью.
// Паттерн DodExplainTooltip: createPortal в body, позиционирование от anchor
// с clamp в viewport, Escape и клик-вне закрывают.

const t = ru.processman;

function severityLabel(value) {
  const severity = normalizeSeverity(value);
  return severity === "error" ? t.reviewSeverityError
    : severity === "warning" ? t.reviewSeverityWarning
      : t.reviewSeverityInfo;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function ReviewAnnotationPopover({ anchor, annotation, onClose }) {
  const [position, setPosition] = useState({ top: -9999, left: -9999 });
  const popoverRef = useRef(null);

  const updatePosition = useCallback(() => {
    const rect = anchor?.getBoundingClientRect?.();
    if (!rect || typeof window === "undefined") return;
    const node = popoverRef.current;
    const width = Number(node?.offsetWidth || 320);
    const height = Number(node?.offsetHeight || 160);
    const gap = 8;
    const viewportW = Number(window.innerWidth || 0);
    const viewportH = Number(window.innerHeight || 0);

    let top = rect.bottom + gap;
    if (top + height > viewportH - 8 && rect.top - gap - height > 8) {
      top = rect.top - gap - height;
    }
    const left = clamp(rect.left, 8, Math.max(8, viewportW - width - 8));
    setPosition({ top, left });
  }, [anchor]);

  useEffect(() => {
    updatePosition();
    const onRelayout = () => updatePosition();
    window.addEventListener("resize", onRelayout);
    window.addEventListener("scroll", onRelayout, true);
    const raf = window.requestAnimationFrame(onRelayout);
    return () => {
      window.removeEventListener("resize", onRelayout);
      window.removeEventListener("scroll", onRelayout, true);
      window.cancelAnimationFrame(raf);
    };
  }, [updatePosition]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    const onMouseDown = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose]);

  if (!annotation || typeof document === "undefined") return null;

  const severity = normalizeSeverity(annotation.severity);
  const comment = String(annotation.comment || "").trim();
  const techCardRef = String(annotation.techCardRef || annotation.tech_card_ref || "").trim();
  const quote = String(annotation.quote || "").trim();

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      className="pm-review-popover"
      data-testid="processman-review-popover"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <div className="pm-review-popover__head">
        <span className={`pm-review-badge pm-review-badge--${severity}`} data-testid="processman-review-popover-severity">
          {severityLabel(severity)}
        </span>
      </div>
      {comment ? <div className="pm-review-popover__comment">{comment}</div> : null}
      {techCardRef ? (
        <div className="pm-review-popover__ref" data-testid="processman-review-popover-ref">
          <div className="pm-review-popover__ref-title">{t.reviewTechCardRef}</div>
          <div className="pm-review-popover__ref-text">{techCardRef}</div>
        </div>
      ) : null}
      {quote ? (
        <div className="pm-review-popover__quote">
          {t.reviewQuote}: «{quote}»
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
