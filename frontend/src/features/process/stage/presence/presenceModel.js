// presenceModel — pure-модель presence (contour feature/async-save-pipeline-step2):
// clientId per tab, нормализация active_users, soft-lock badge-текст.
// Вынесена из useSessionPresence.js отдельно, чтобы unit-тесты шли без react
// (node --test, депов нет). useSessionPresence.js реэкспортирует контракт.

function toText(value) {
  return String(value || "").trim();
}

const SESSION_PRESENCE_CLIENT_ID_KEY = "processmap:session-presence:client-id";

function randomClientId() {
  const cryptoObj = typeof window !== "undefined" ? window.crypto : null;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionPresenceClientId(storage = null) {
  const store = storage || (typeof window !== "undefined" ? window.sessionStorage : null);
  try {
    const existing = toText(store?.getItem?.(SESSION_PRESENCE_CLIENT_ID_KEY));
    if (existing) return existing;
    const next = randomClientId();
    store?.setItem?.(SESSION_PRESENCE_CLIENT_ID_KEY, next);
    return next;
  } catch {
    return randomClientId();
  }
}

function normalizeLastSeenMs(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 1000000000000 ? Math.round(raw * 1000) : Math.round(raw);
}

export function normalizeSessionPresenceUsers(itemsRaw = []) {
  const items = Array.isArray(itemsRaw) ? itemsRaw : [];
  return items
    .map((itemRaw) => {
      const item = itemRaw && typeof itemRaw === "object" ? itemRaw : {};
      const userId = toText(item.user_id || item.userId);
      const label = toText(item.display_name || item.displayName || item.full_name || item.fullName || item.email || userId);
      if (!userId && !label) return null;
      return {
        userId,
        label: label || "Пользователь",
        email: toText(item.email),
        fullName: toText(item.full_name || item.fullName),
        jobTitle: toText(item.job_title || item.jobTitle),
        lastSeenAt: normalizeLastSeenMs(item.last_seen_at || item.lastSeenAt),
        isCurrentUser: item.is_current_user === true || item.isCurrentUser === true,
        // step2 soft-lock (UI.md §7): элемент, который пользователь сейчас
        // редактирует (advisory; TTL = presence TTL). Единый контракт shape:
        // backend wire использует null — отсутствие = null, не "" (MAJOR-2
        // review: тест и имплементация к одному контракту).
        editingElementId: toText(item.editing_element_id || item.editingElementId) || null,
      };
    })
    .filter(Boolean);
}

// step2 soft-lock (UI.md §7): текст бейджа «{name} редактирует этот элемент»
// для presence-панели/оверлея. Пусто, когда editingElementId не задан.
export function presenceEditingBadgeText(userRaw = null) {
  const user = userRaw && typeof userRaw === "object" ? userRaw : {};
  const elementId = toText(user.editingElementId);
  if (!elementId) return "";
  const label = toText(user.label || user.fullName || user.email || user.userId) || "Пользователь";
  return `${label} редактирует этот элемент`;
}
