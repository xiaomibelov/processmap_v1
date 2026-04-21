function resolveToneClass(tone) {
  if (tone === "error") {
    return "border-rose-500/55 bg-rose-500/18 text-rose-50";
  }
  if (tone === "warning") {
    return "border-amber-500/55 bg-amber-500/18 text-amber-50";
  }
  if (tone === "info") {
    return "border-sky-500/55 bg-sky-500/18 text-sky-50";
  }
  return "border-cyan-500/55 bg-cyan-500/18 text-cyan-50";
}

export default function ProcessSaveAckToast({
  visible = false,
  message = "",
  tone = "success",
} = {}) {
  if (!visible || !String(message || "").trim()) return null;
  const toneClass = resolveToneClass(String(tone || "").trim());
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[130] w-[min(92vw,560px)] -translate-x-1/2 sm:bottom-6">
      <div
        role="status"
        aria-live="polite"
        className={`rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur ${toneClass}`}
        data-testid="process-save-ack-toast"
      >
        {String(message || "")}
      </div>
    </div>
  );
}
