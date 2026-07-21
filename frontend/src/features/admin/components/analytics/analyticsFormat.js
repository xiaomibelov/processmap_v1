// Display formatting for analytics numbers. Presentation only — no
// aggregation; all values are computed server-side.

export function formatDurationSeconds(secondsRaw) {
  const seconds = Math.max(0, Math.round(Number(secondsRaw) || 0));
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}мин`;
  }
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) {
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}ч ${minutes}мин` : `${hours}ч`;
  }
  const days = Math.floor(seconds / 86400);
  const restHours = Math.floor((seconds % 86400) / 3600);
  return restHours > 0 ? `${days}д ${restHours}ч` : `${days}д`;
}

export const ANALYTICS_STATUS_META = {
  real_work: { label: "Работа", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  abandoned: { label: "Заброшена", className: "border-amber-200 bg-amber-50 text-amber-700" },
  short: { label: "Короткая", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

export function analyticsStatusMeta(status) {
  const key = String(status || "").trim();
  return ANALYTICS_STATUS_META[key] || { label: key || "—", className: "border-slate-200 bg-slate-50 text-slate-600" };
}
