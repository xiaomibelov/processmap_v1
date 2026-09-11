// Инкрементальный diff модели для редактирования на схемах 250+ элементов.
//
// Контур fix/canvas-250-editing-performance. Контракт зафиксирован RED-тестами
// model-diff.test.mjs (этап 1). Идея: правка одного элемента не должна
// оплачиваться полным пересчётом/сериализацией всей модели.

// Tracker элементных правок: накапливает id изменённых элементов и на flush()
// пересчитывает только их. Полный diff (onFullDiff) вызывается только при
// структурных изменениях (добавление/удаление элементов, потоки управления).
export function createModelDiffTracker({ onFullDiff } = {}) {
  const pendingElementIds = new Set();
  let structureChanged = false;
  let fullDiffCalls = 0;
  const elementsRecomputed = [];

  function flush() {
    if (structureChanged) {
      structureChanged = false;
      pendingElementIds.clear();
      fullDiffCalls += 1;
      onFullDiff?.({ scope: "all" });
      return [];
    }
    const recomputed = [...pendingElementIds];
    pendingElementIds.clear();
    for (const id of recomputed) elementsRecomputed.push(id);
    return recomputed;
  }

  function stats() {
    return {
      fullDiffCalls,
      elementsRecomputed: elementsRecomputed.slice(),
    };
  }

  return {
    notifyElementEdited(idRaw) {
      const id = String(idRaw ?? "").trim();
      if (id) pendingElementIds.add(id);
    },
    notifyStructureChanged() {
      structureChanged = true;
    },
    flush,
    stats,
  };
}

// Мемоизация рендера элементов: invalidate() помечает конкретные узлы,
// takeInvalidated() возвращает и очищает множество — повторный запрос без
// новых правок возвращает пустой массив (узлы B..Z не инвалидируются
// при правке узла A).
export function createElementRenderMemo() {
  const invalidated = new Set();
  return {
    invalidate(idRaw) {
      const id = String(idRaw ?? "").trim();
      if (id) invalidated.add(id);
    },
    takeInvalidated() {
      const out = [...invalidated];
      invalidated.clear();
      return out;
    },
  };
}

// Создание версии не блокируется незавершённым direct-editing: активная
// сессия редактирования метки автозавершается, набранный текст коммитится
// в модель, и версия создаётся из актуального состояния.
export function resolveRevisionCreateAvailability({
  directEditingActive = false,
  hasUnsavedChanges = false,
} = {}) {
  if (directEditingActive) {
    return {
      allowed: true,
      completesDirectEditing: true,
      reason: hasUnsavedChanges
        ? "Активное редактирование метки будет завершено перед созданием версии — набранный текст сохранится в модель."
        : "Активное редактирование метки будет завершено перед созданием версии.",
    };
  }
  return {
    allowed: true,
    completesDirectEditing: false,
    reason: hasUnsavedChanges
      ? "Несохранённые изменения будут сохранены в новой версии."
      : "Изменений нет — версия создаётся из текущего состояния диаграммы.",
  };
}
