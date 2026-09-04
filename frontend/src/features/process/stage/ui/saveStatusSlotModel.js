function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

const SLOT_SOURCE_PREFIXES = [
  "Сохранение",
  "Версия BPMN",
  "Синхронизация",
  "Конфликт",
  "Другой пользователь",
  "Документ",
  "Ошибка сохранения",
  "Процесс",
];

export function stripSaveStatusSlotPrefix(messageRaw = "") {
  const message = toText(messageRaw);
  if (!message) return "";
  for (const prefix of SLOT_SOURCE_PREFIXES) {
    if (message.startsWith(`${prefix}:`)) {
      return toText(message.slice(prefix.length + 1).replace(/[.]+$/g, ""));
    }
  }
  return toText(message.replace(/[.]+$/g, ""));
}

/**
 * П3: единый узел статуса сохранения в правом слоте хедера.
 * Словарь state зафиксирован контрактом: saving/dirty/saved/failed/stale/conflict.
 */
export function buildSaveStatusSlotView({
  saveUploadStatusRaw = null,
  saveSnapshotRaw = null,
  flashRaw = null,
} = {}) {
  const status = asObject(saveUploadStatusRaw);
  const snapshot = asObject(saveSnapshotRaw);
  const flash = asObject(flashRaw);

  const uploadState = toText(status.state);
  let state = "saved";
  if (uploadState === "conflict") state = "conflict";
  else if (uploadState === "saving" || snapshot.isSaving === true) state = "saving";
  else if (uploadState === "save_failed" || snapshot.isFailed === true) state = "failed";
  else if (snapshot.isStale === true) state = "stale";
  else if (snapshot.isDirty === true) state = "dirty";

  const labels = {
    conflict: "Конфликт сохранения",
    saving: "Сохранение…",
    failed: "Ошибка сохранения",
    stale: "Требуется синхронизация",
    dirty: "Есть изменения",
    saved: "Сохранено",
  };
  const titles = {
    conflict: toText(status.title) || "Сервер отклонил сохранение: версия сессии изменилась.",
    saving: "Сохраняем черновик сессии.",
    failed: toText(status.title) || "Не удалось подтвердить сохранение сессии.",
    stale: "Сессия устарела. Требуется синхронизация перед сохранением.",
    dirty: "Сессия изменена. Сохраните изменения.",
    saved: "Черновик сессии сохранён.",
  };

  const flashMessage = toText(flash.message);
  const flashVisible = flash.visible === true && flashMessage.length > 0;

  return {
    state,
    label: labels[state],
    title: titles[state],
    flashVisible,
    flashLabel: flashVisible ? stripSaveStatusSlotPrefix(flashMessage) : "",
  };
}
