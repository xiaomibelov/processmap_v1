// Внешнее хранилище состояния mock-режима TO BE overlay.
// Разделяется между BpmnStage (слои/контроллер) и ProcessStageHeader
// (кнопки входа/выхода и show/hide подложки) без prop-drilling.
// Состояние не персистится (Known limitations PLAN.md); ghost-видимость
// сбрасывается при выходе из режима.

let state = { active: false, ghostVisible: true };
const listeners = new Set();

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // слушатель не должен ломать остальных подписчиков
    }
  }
}

export function getTobeOverlayMockState() {
  return state;
}

export function subscribeTobeOverlayMock(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setTobeOverlayMockActive(active) {
  const nextActive = !!active;
  const nextGhostVisible = nextActive ? state.ghostVisible : true;
  if (state.active === nextActive && state.ghostVisible === nextGhostVisible) return;
  state = { active: nextActive, ghostVisible: nextGhostVisible };
  emit();
}

export function setTobeOverlayMockGhostVisible(visible) {
  if (!state.active) return;
  const nextGhostVisible = !!visible;
  if (state.ghostVisible === nextGhostVisible) return;
  state = { ...state, ghostVisible: nextGhostVisible };
  emit();
}

export function resetTobeOverlayMockState() {
  if (!state.active && state.ghostVisible) return;
  state = { active: false, ghostVisible: true };
  emit();
}
