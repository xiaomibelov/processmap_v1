import { useEffect } from "react";

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
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cx("modalOverlay", overlayClassName)}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={cx("modalCard", cardClassName)}>
        <div className={cx("modalHeader", headerClassName)}>
          <div className="modalTitle">{title || ""}</div>
          <button type="button" className="iconBtn" onClick={onClose} title="Закрыть">
            ✕
          </button>
        </div>

        <div className={cx("modalBody", bodyClassName)}>{children}</div>

        {footer ? <div className={cx("modalFooter", footerClassName)}>{footer}</div> : null}
      </div>
    </div>
  );
}
