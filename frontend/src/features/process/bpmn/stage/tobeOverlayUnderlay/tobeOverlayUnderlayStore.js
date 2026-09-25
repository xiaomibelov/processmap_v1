// Внешнее хранилище состояния underlay-режима TO BE (реальная AS IS-подложка).
// Разделяется между BpmnStage (fetch-адаптер/контроллер) и ProcessStageHeader
// (кнопка show/hide) без prop-drilling. Состояние active/visible не
// персистится (UI.md); видимость подложки сбрасывается при выходе из режима
// (смена сессии/флаг). Поведение зеркалирует mockOverlayModeStore (аудит Q5):
// глобально, без persist.
// Ghost-видимость (пресет faint/medium/strong) — исключение: персистится
// в localStorage (ghostVisibilityStorage), гидратация ленивая — при первом
// чтении, без side-effect в module scope (unit-тесты без DOM не трогают
// localStorage). Хранится отдельно от state, чтобы не ломать контракт
// getTobeOverlayUnderlayState() для существующих потребителей.

import { normalizeGhostVisibility } from "./ghostVisibilityPresets.js";
import { readGhostVisibility, writeGhostVisibility } from "./ghostVisibilityStorage.js";

let state = { active: false, visible: true, available: true };
const listeners = new Set();

let ghostVisibility = normalizeGhostVisibility(null);
let ghostHydrated = false;

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // слушатель не должен ломать остальных подписчиков
    }
  }
}

export function getTobeOverlayUnderlayState() {
  return state;
}

export function subscribeTobeOverlayUnderlay(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setTobeOverlayUnderlayActive(active) {
  const nextActive = !!active;
  const nextVisible = nextActive ? state.visible : true;
  if (state.active === nextActive && state.visible === nextVisible) return;
  state = { ...state, active: nextActive, visible: nextVisible };
  emit();
}

export function setTobeOverlayUnderlayVisible(visible) {
  if (!state.active) return;
  const nextVisible = !!visible;
  if (state.visible === nextVisible) return;
  state = { ...state, visible: nextVisible };
  emit();
}

// Доступность связанной AS IS-сессии (404/ошибка fetch → disabled-кнопка).
export function setTobeOverlayUnderlayAvailable(available) {
  const nextAvailable = !!available;
  if (state.available === nextAvailable) return;
  state = { ...state, available: nextAvailable };
  emit();
}

export function resetTobeOverlayUnderlayState() {
  if (!state.active && state.visible && state.available) return;
  state = { active: false, visible: true, available: true };
  emit();
}

// --- Ghost-видимость подложки (пресет faint/medium/strong) -------------------

// Ленивая гидратация persisted-пресета. Явный вызов с инжектом storage —
// для тестов; без аргумента — idempotent (один раз за модуль). В среде без
// DOM readGhostVisibility вернёт null → normalize даст дефолт "medium".
export function hydrateGhostVisibility(storage) {
  if (ghostHydrated && storage === undefined) return ghostVisibility;
  ghostVisibility = normalizeGhostVisibility(readGhostVisibility(storage));
  ghostHydrated = true;
  return ghostVisibility;
}

// Текущий пресет видимости; при первом обращении гидрирует из localStorage.
export function getGhostVisibility() {
  if (!ghostHydrated) return hydrateGhostVisibility();
  return ghostVisibility;
}

// Устанавливает пресет: normalize → state → нотификация → persist.
// Возвращает применённый (нормализованный) пресет. Не бросает: при ошибке
// записи в localStorage состояние всё равно применено (in-memory fallback,
// как в overlayPanVisibilityStorage).
export function setGhostVisibility(preset, storage) {
  const next = normalizeGhostVisibility(preset);
  const changed = ghostVisibility !== next;
  ghostVisibility = next;
  ghostHydrated = true;
  if (changed) emit();
  writeGhostVisibility(next, storage);
  return next;
}
