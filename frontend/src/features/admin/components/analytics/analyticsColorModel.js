// Presentation helpers for the session analytics charts. Server assigns the
// color_label per bin; here we only map it to a fill color and normalize bar
// heights to the max count (the single allowed presentation ratio — counts
// and percentages shown come from the server payload).

export const ANALYTICS_COLOR_MAP = {
  real_work: "#10b981", // emerald-500
  abandoned: "#f59e0b", // amber-500
  neutral: "#94a3b8", // slate-400
};

export function analyticsColorForLabel(label) {
  const key = String(label || "").trim();
  return ANALYTICS_COLOR_MAP[key] || ANALYTICS_COLOR_MAP.neutral;
}

export function computeBarHeights(bins, maxHeight = 120) {
  const list = Array.isArray(bins) ? bins : [];
  const cap = Math.max(1, Number(maxHeight) || 120);
  const maxCount = list.reduce((acc, row) => Math.max(acc, Number(row?.count) || 0), 0);
  if (maxCount <= 0) return list.map(() => 0);
  return list.map((row) => Math.round(((Number(row?.count) || 0) / maxCount) * cap));
}
