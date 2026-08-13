import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

function cx(...items) {
  return items.filter(Boolean).join(" ");
}

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  overlayClassName = "",
  cardClassName = "",
  headerClassName = "",
  bodyClassName = "",
  footerClassName = "",
}) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e) {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        cardRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || [],
      ).filter((node) => !node.hasAttribute("disabled") && node.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cx("modalOverlay", overlayClassName)}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={cx("modalCard", cardClassName)} ref={cardRef}>
        <div className={cx("modalHeader", headerClassName)}>
          <div className="modalTitle">{title || ""}</div>
          <button type="button" className="iconBtn" onClick={onClose} title="Закрыть">
            ✕
          </button>
        </div>

        <div className={cx("modalBody", bodyClassName)}>{children}</div>

        {footer ? <div className={cx("modalFooter", footerClassName)}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
