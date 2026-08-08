// UX-UPDATE — модель тоста «Вышло обновление ProcessMap» (документ владельца):
// источник правды — static/version.json {sha, builtAt} из dist; тост один раз
// на SHA за сессию; [Позже] = snooze 30 мин (НОВАЯ семантика, заменяет
// постоянный dismiss-per-runtimeId). Принудительный reload запрещён —
// reloadPage вызывается только по клику [Обновить] после guard+flush.
export const APP_UPDATE_POLL_INTERVAL_MS = 300000; // 5 минут
export const APP_UPDATE_SNOOZE_MS = 30 * 60 * 1000; // 30 минут
export const APP_UPDATE_SNOOZE_STORAGE_KEY = "processmap:app-update:snooze-until";
export const APP_UPDATE_VERSION_URL = "/version.json";

function toText(value) {
  return String(value || "").trim();
}

function toTs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getDefaultSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

/** Ответ GET /version.json → {sha, builtAt} | null (мусор → null, молча). */
export function normalizeVersionJson(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const sha = toText(source.sha);
  if (!sha) return null;
  return { sha, builtAt: toText(source.builtAt) };
}

/** SHA, вшитый в бандл на build (VITE_BUILD_ID = короткий git sha в CI). */
export function getCurrentBuildSha(env = {}) {
  return toText(env.VITE_BUILD_ID || env.buildId || "dev");
}

// ---------------------------------------------------------------- snooze
function readSnoozeMap(storage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(APP_UPDATE_SNOOZE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSnoozeMap(map, storage) {
  if (!storage) return false;
  try {
    storage.setItem(APP_UPDATE_SNOOZE_STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/** До какого ts отложен показ для sha (0 = не отложен). */
export function getUpdateSnoozeUntil(sha, storage = getDefaultSessionStorage()) {
  return toTs(readSnoozeMap(storage)[toText(sha)]);
}

/** [Позже] → snooze 30 мин для конкретного sha. */
export function setUpdateSnooze(sha, now = Date.now(), storage = getDefaultSessionStorage()) {
  const key = toText(sha);
  if (!key) return false;
  const map = readSnoozeMap(storage);
  map[key] = toTs(now) + APP_UPDATE_SNOOZE_MS;
  return writeSnoozeMap(map, storage);
}

/**
 * Показывать ли тост: удалённый sha известен, отличается от вшитого в бандл,
 * и snooze для него истёк (или не был). Один раз на SHA за сессию: после
 * snooze тост вернётся через 30 мин, после reload с новым бандлом sha
 * совпадёт и тост не покажется.
 */
export function shouldShowUpdateToast({
  currentSha = "",
  remoteSha = "",
  now = Date.now(),
  storage = getDefaultSessionStorage(),
} = {}) {
  const remote = toText(remoteSha);
  if (!remote || remote === "dev") return false;
  if (remote === toText(currentSha)) return false;
  return toTs(now) >= getUpdateSnoozeUntil(remote, storage);
}

/** reload — ТОЛЬКО по клику [Обновить] (принудительный запрещён). */
export function reloadPage(win = typeof window === "undefined" ? null : window) {
  win?.location?.reload?.();
}
