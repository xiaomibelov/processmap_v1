// deferredSaveRetry — контур fix/ops-422-quick-create-property (RC2).
//
// saveFromModeler при активном direct-editing возвращает pending (модель ещё
// не содержит набираемый текст — сериализовать посреди редактирования
// бессмысленно, контур #952). Ретрай обязан произойти ПО ЗАВЕРШЕНИИ editing —
// независимо от того, изменил пользователь текст (тогда спасёт
// commandStack.changed → autosave) или нет (cancel/complete без изменения —
// тогда autosave не запросится ничем: blackhole, аудит RC2).
//
// Одноразовый arm на события directEditing.complete/cancel modeler'а:
// первое же событие снимает оба слушателя и дёргает retry. Новых путей
// сохранения НЕТ — retry исполняет тот же saveFromModeler.

/**
 * @param {Object} modeler - bpmn-js instance (eventBus через .get)
 * @param {Function} retry - () => void | Promise<void>
 * @returns {boolean} armed
 */
export function armDeferredSaveRetry(modeler, retry) {
  const eventBus = modeler?.get?.("eventBus");
  if (!eventBus || typeof eventBus.once !== "function" || typeof retry !== "function") {
    return false;
  }
  let fired = false;
  const handler = () => {
    if (fired) return;
    fired = true;
    try {
      eventBus.off?.("directEditing.complete", handler);
      eventBus.off?.("directEditing.cancel", handler);
    } catch {
      // off недоступен — once-гарантия diagram-js всё равно одноразовая
    }
    try {
      retry();
    } catch {
      // retry must never break the editing cascade
    }
  };
  try {
    eventBus.once("directEditing.complete", handler);
    eventBus.once("directEditing.cancel", handler);
    return true;
  } catch {
    return false;
  }
}
