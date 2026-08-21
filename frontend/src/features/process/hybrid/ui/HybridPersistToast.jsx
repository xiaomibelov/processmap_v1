export default function HybridPersistToast({
  visible = false,
  message = "",
  pendingDraft = false,
  onRetry = null,
  onDismiss = null,
  layout = "",
}) {
  // FIX-V (блок 2): layout="stack" — in-flow карточка внутри
  // ProcessToastViewport (единый стек под тулбаром). Дефолтный режим
  // сохранён для совместимости, но контейнер переведён на
  // pointer-events-none (события ловит только карточка).
  const isStackLayout = layout === "stack";
  if (!visible) return null;
  const containerClassName = isStackLayout
    ? "pointer-events-none w-full"
    : "pointer-events-none fixed bottom-4 right-4 z-[120] w-[min(92vw,420px)]";
  return (
    <div className={containerClassName}>
      <div
        className="pointer-events-auto w-full rounded-xl border border-accent/30 bg-panel/95 p-3 shadow-2xl backdrop-blur"
        role="status"
        aria-live="polite"
        data-testid="hybrid-persist-toast"
      >
        <div className="mb-2 text-sm font-semibold text-fg">
          {String(message || "Session is being updated. Retry in a moment.")}
        </div>
        <div className="mb-3 text-xs text-muted">
          {pendingDraft ? "Unsaved Hybrid changes are kept locally." : "No pending changes."}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="primaryBtn h-8 px-3 text-xs"
            onClick={() => onRetry?.()}
            data-testid="hybrid-persist-toast-retry"
          >
            Retry
          </button>
          <button
            type="button"
            className="secondaryBtn h-8 px-3 text-xs"
            onClick={() => onDismiss?.()}
            data-testid="hybrid-persist-toast-dismiss"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
