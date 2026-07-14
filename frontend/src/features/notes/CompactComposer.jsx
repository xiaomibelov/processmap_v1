import { useState } from "react";

/**
 * Compact note composer for the sidebar. Self-contained draft state;
 * calls onSubmit(body) and clears itself when the submit resolves ok.
 * Ctrl/Cmd+Enter submits — same convention as the other sidebar composers.
 */
export default function CompactComposer({
  onSubmit,
  busy = false,
  disabled = false,
  placeholder = "Добавить заметку…",
  submitLabel = "Добавить",
  busyLabel = "Сохраняю…",
}) {
  const [value, setValue] = useState("");
  const canSubmit = !busy && !disabled && value.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    const result = onSubmit?.(value.trim());
    const resolved = result && typeof result.then === "function" ? await result : result;
    if (resolved?.ok === false) return; // keep the draft so the user can retry
    setValue("");
  };

  return (
    <div className="mt-3" data-testid="fb-helper-composer">
      <textarea
        className="input min-h-[72px] w-full min-w-0 rounded-xl px-3 py-2 text-sm leading-relaxed"
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={2}
        style={{ resize: "vertical" }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        disabled={!!disabled || !!busy}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted">Ctrl/Cmd + Enter</span>
        <button
          type="button"
          className="primaryBtn h-8 px-3 text-[12px]"
          onClick={() => void submit()}
          disabled={!canSubmit}
        >
          {busy ? busyLabel : submitLabel}
        </button>
      </div>
    </div>
  );
}
