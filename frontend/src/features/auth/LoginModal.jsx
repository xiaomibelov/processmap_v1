import { useEffect, useMemo, useRef } from "react";

import LoginForm from "./LoginForm";

function getFocusable(container) {
  if (!container) return [];
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(container.querySelectorAll(selector)).filter((el) => !el.hasAttribute("disabled"));
}

export default function LoginModal({ open, onClose, onSuccess, locked = false }) {
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const prevFocusedRef = useRef(null);

  const title = useMemo(
    () => (locked ? "Сессия истекла, войдите снова" : "Вход в PROCESSMAP"),
    [locked],
  );

  useEffect(() => {
    if (!open) return undefined;

    prevFocusedRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timer = window.setTimeout(() => {
      const focusable = getFocusable(dialogRef.current);
      if (focusable.length) focusable[0].focus();
      else dialogRef.current?.focus();
    }, 0);

    function onKeyDown(e) {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = getFocusable(dialogRef.current);
      if (!focusable.length) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !dialogRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const prev = prevFocusedRef.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-bg/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Вход"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl border border-border bg-panel p-5 shadow-panel"
        tabIndex={-1}
      >
        <LoginForm
          compact
          title={title}
          subtitle={locked ? "Для продолжения работы в рабочей зоне подтвердите вход." : "Введите email и пароль."}
          submitLabel="Войти"
          onSuccess={onSuccess}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
