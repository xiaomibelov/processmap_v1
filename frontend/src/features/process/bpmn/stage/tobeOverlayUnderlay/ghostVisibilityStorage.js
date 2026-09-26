// Persist пресета видимости ghost-подложки AS IS в localStorage.
// Форма — по образцу utils/overlayPanVisibilityStorage.js: try/catch на
// read/write, обработка quota-ошибок с очисткой служебных ключей __FPC_*.
// Значение — plain-строка пресета (faint/medium/strong), НЕ JSON.
// Контракт: read/write НИКОГДА не бросают наружу.
// readGhostVisibility НЕ валидирует значение: невалидная строка читается
// как есть — валидность обеспечивает normalizeGhostVisibility на стороне
// потребителя (store сводит к DEFAULT при hydrate/set).

export const GHOST_VISIBILITY_STORAGE_KEY = "tobe_underlay_ghost_visibility";

function isQuotaError(error) {
  if (!error) return false;
  return error.name === "QuotaExceededError"
    || error.code === 22
    || error.code === 1014
    || String(error.message || "").toLowerCase().includes("quota");
}

function tryFreeLocalStorageSpace() {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("__FPC_"))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore cleanup errors
  }
}

// Инжект storage для тестов; по умолчанию — window.localStorage.
// В среде без DOM (node) возвращает null — вызовы становятся no-op.
function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

// Читает persisted-пресет: строка-пресет или null (нет значения / ошибка
// чтения / среда без DOM). Невалидные строки возвращаются как есть —
// нормализация — ответственность потребителя.
export function readGhostVisibility(storage) {
  try {
    const target = resolveStorage(storage);
    if (!target) return null;
    return target.getItem(GHOST_VISIBILITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Пишет пресет в localStorage. Возвращает bool: false при любой ошибке
// записи (SecurityError, quota и т.п.), НЕ бросает наружу.
export function writeGhostVisibility(preset, storage) {
  const str = String(preset);
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    target.setItem(GHOST_VISIBILITY_STORAGE_KEY, str);
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      tryFreeLocalStorageSpace();
      try {
        target.setItem(GHOST_VISIBILITY_STORAGE_KEY, str);
        return true;
      } catch (retryError) {
        // eslint-disable-next-line no-console
        console.warn("[tobeOverlayUnderlay] localStorage quota exceeded; ghost visibility not persisted", retryError);
      }
    }
    return false;
  }
}
