// UX-UPDATE — модель тоста «Вышло обновление ProcessMap» (документ владельца):
// источник правды — static/version.json {sha, builtAt} из dist; тост один раз
// на SHA за сессию; [Позже] = snooze 30 мин (НОВАЯ семантика, заменяет
// постоянный dismiss-per-runtimeId). Авто-reload разрешён ТОЛЬКО в «чистом»
// состоянии (нет несохранённых изменений) и один раз на SHA за сессию;
// ручной [Обновить] остаётся fallback для грязного/опасного состояния.
export const APP_UPDATE_POLL_INTERVAL_MS = 300000; // 5 минут
export const APP_UPDATE_SNOOZE_MS = 30 * 60 * 1000; // 30 минут
export const APP_UPDATE_SNOOZE_STORAGE_KEY = "processmap:app-update:snooze-until";
export const APP_UPDATE_AUTO_RELOAD_DELAY_MS = 5000; // 5 сек — время увидеть тост
export const APP_UPDATE_AUTO_RELOADED_STORAGE_KEY = "processmap:app-update:auto-reloaded";
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

/** Ответ GET /version.json → {sha, builtAt} | null (мусор → null, молча).
 *  Сервер stage отдаёт {commit, buildTime}; dev/CI — {sha, builtAt}.
 */
export function normalizeVersionJson(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const sha = toText(source.sha || source.commit);
  if (!sha) return null;
  return { sha, builtAt: toText(source.builtAt || source.buildTime) };
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

function getDefaultAutoReloadStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

/** Один раз за сессию авто-reload для конкретного remote SHA уже выполнен? */
export function hasAutoReloadedForSha(sha, storage = getDefaultAutoReloadStorage()) {
  if (!storage) return false;
  try {
    return storage.getItem(APP_UPDATE_AUTO_RELOADED_STORAGE_KEY) === toText(sha);
  } catch {
    return false;
  }
}

/** Пометить, что авто-reload для remote SHA уже выполнен. */
export function markAutoReloadedForSha(sha, storage = getDefaultAutoReloadStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(APP_UPDATE_AUTO_RELOADED_STORAGE_KEY, toText(sha));
    return true;
  } catch {
    return false;
  }
}

/**
 * Обычный location.reload(). НЕ использовать для сценария обновления версии:
 * под контролем исторического SW перезагрузка обслуживается из его Cache
 * Storage и отдаёт старый бандл. Для [Обновить]/авто-reload — hardReloadPage.
 */
export function reloadPage(win = typeof window === "undefined" ? null : window) {
  win?.location?.reload?.();
}

// ---------------------------------------------------------------- hardReloadPage
/** Очистка Cache Storage (аналог clearCaches в index.html); мок win.caches в тестах. */
async function clearPageCaches(win) {
  const store = win?.caches || (typeof caches !== "undefined" ? caches : null);
  if (!store || typeof store.keys !== "function") return;
  try {
    const keys = await store.keys();
    await Promise.all((keys || []).map((key) => Promise.resolve(store.delete(key)).catch(() => {})));
  } catch {
    // ошибки кэша не прерывают цепочку
  }
}

/** Unregister всех service worker'ов; ошибки глушим, цепочку не прерываем. */
async function unregisterPageServiceWorkers(win) {
  const sw = win?.navigator?.serviceWorker;
  if (!sw || typeof sw.getRegistrations !== "function") return;
  try {
    const registrations = await sw.getRegistrations();
    await Promise.all(
      (registrations || []).map((registration) =>
        Promise.resolve(registration?.unregister?.()).catch(() => {}),
      ),
    );
  } catch {
    // ошибки SW не прерывают цепочку
  }
}

/**
 * Гарантированный переход на новый бандл: unregister всех SW + очистка
 * Cache Storage + навигация с cache-bust (__pm_cb) — идентично hardReload()
 * из index.html. Reload — терминальная операция: функция всегда резолвится
 * и не бросает.
 *
 * Постоянный механизм: исторические SW, зарегистрированные старыми версиями
 * приложения, живут в браузерах пользователей годами. Их controller обслуживает
 * обычный location.reload() из своего Cache Storage → старый index.html →
 * старый бандл. Обычный reloadPage() для этого сценария не подходит.
 *
 * Переходный путь для уже «застрявших» пользователей: они получат НОВЫЙ
 * index.html при первой же загрузке (kill-switch в index.html снимет SW), а
 * эта функция чинит последующие обновления по кнопке [Обновить].
 */
export async function hardReloadPage(win = typeof window === "undefined" ? null : window) {
  if (!win) return;
  try {
    await unregisterPageServiceWorkers(win);
    await clearPageCaches(win);
  } catch {
    // любые ошибки подготовки игнорируем — reload всё равно выполняем
  }
  try {
    var url = String(win.location?.href || "").replace(/([?&])__pm_cb=\d+&?/g, "$1").replace(/[?&]$/, "");
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    win.location.href = url + sep + "__pm_cb=" + Date.now();
  } catch {
    win.location?.reload?.(true);
  }
}
