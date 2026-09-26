// Флаг одноразовой empty-state-подсказки provenance (T11): TO BE собрана
// вручную или создана до появления трассировки → индекса нет (status
// "empty"), подсветка молчит, пользователь не понимает ПОЧЕМУ. Hint
// показывается один раз за сессию после первой попытки selection.
// Module-state по образцу underlay/provenance-store; сброс при смене сессии
// (resetProvenanceEmptyHint из teardown-эффекта BpmnStage).

let selectionSeen = false;
let dismissed = false;
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

export function getTobeProvenanceEmptyHintState() {
  return { selectionSeen, dismissed };
}

export function subscribeTobeProvenanceEmptyHint(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Триггер (только факт непустого selection, без индекса — wire-эффект
// BpmnStage на selection.changed при status "empty"). Идемпотентно: повторные
// selection не дублируют hint.
export function noteProvenanceSelectionSeen() {
  if (selectionSeen) return;
  selectionSeen = true;
  emit();
}

export function dismissProvenanceEmptyHint() {
  if (dismissed) return;
  dismissed = true;
  emit();
}

// Смена сессии: флаг к нулю — новая сессия имеет право на свою подсказку.
export function resetProvenanceEmptyHint() {
  if (!selectionSeen && !dismissed) return;
  selectionSeen = false;
  dismissed = false;
  emit();
}
