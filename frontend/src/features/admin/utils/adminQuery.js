function toText(value) {
  return String(value ?? "").trim();
}

export const ADMIN_PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

export function updateFilterState(current = {}, patch = {}) {
  return {
    ...current,
    ...patch,
  };
}

export function normalizeSearchTerm(value) {
  return toText(value);
}

export function parsePageSize(raw, fallback = 20) {
  const value = Number(raw || 0);
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (!ADMIN_PAGE_SIZE_OPTIONS.includes(rounded)) return fallback;
  return rounded;
}

export function parsePage(raw, fallback = 1) {
  const value = Number(raw || 0);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

export function pageToOffset(page = 1, pageSize = 20) {
  return Math.max(0, (parsePage(page, 1) - 1) * parsePageSize(pageSize, 20));
}

export function rangeToTsFrom(range = "", nowTs = null) {
  const now = Number.isFinite(Number(nowTs)) && Number(nowTs) > 0
    ? Math.round(Number(nowTs))
    : Math.round(Date.now() / 1000);
  const normalized = toText(range).toLowerCase();
  if (normalized === "24h") return now - 24 * 60 * 60;
  if (normalized === "7d") return now - 7 * 24 * 60 * 60;
  if (normalized === "30d") return now - 30 * 24 * 60 * 60;
  return 0;
}

export function mergeSearchParams(search = "", patch = {}, { resetPage = false } = {}) {
  const params = new URLSearchParams(String(search || ""));
  Object.entries(patch || {}).forEach(([key, value]) => {
    const text = toText(value);
    if (!text) {
      params.delete(String(key));
      return;
    }
    params.set(String(key), text);
  });
  if (resetPage) params.set("page", "1");
  return params;
}
