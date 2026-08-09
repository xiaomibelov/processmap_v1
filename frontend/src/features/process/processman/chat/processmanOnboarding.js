// PROCESSMAN-REDESIGN (PR-1) — one-shot флаг онбординга (чистая логика).
// Карточка «Помощник на схеме (LLM)» показывается один раз при первом
// открытии панели, затем сворачивается в иконку «?» в шапке.
// Хранилище инжектится (localStorage в браузере, мок в тестах).

export const ONBOARDING_STORAGE_KEY = "fpc.processman.onboarded.v1";

export function isOnboardingSeen(storage) {
  try {
    return String(storage?.getItem?.(ONBOARDING_STORAGE_KEY) || "") === "1";
  } catch {
    return false; // недоступное хранилище ≠ «уже видел»: покажем честно
  }
}

export function markOnboardingSeen(storage) {
  try {
    storage?.setItem?.(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // no-op: при недоступном хранилище карточка просто покажется ещё раз
  }
}
