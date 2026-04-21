function resolveToneClass(tone) {
  if (tone === "error") {
    return "border-red-500/40 bg-red-500/10 text-red-100";
  }
  if (tone === "warning") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  }
  if (tone === "info") {
    return "border-sky-500/40 bg-sky-500/10 text-sky-100";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
}

export default function ProcessSaveAckToast({
  visible = false,
  message = "",
  tone = "success",
} = {}) {
  if (!visible || !String(message || "").trim()) return null;
  const toneClass = resolveToneClass(String(tone || "").trim());
  return (
    <div className="pointer-events-none fixed right-4 top-16 z-[130] w-[min(92vw,460px)]">
      <div
        role="status"
        aria-live="polite"
        className={`rounded-lg border px-3 py-2 text-sm font-medium shadow-xl backdrop-blur ${toneClass}`}
        data-testid="process-save-ack-toast"
      >
        {String(message || "")}
      </div>
    </div>
  );
}
