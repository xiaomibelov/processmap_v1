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
 *
 * Outbox-стадии дельта-сохранения (contour feature/async-save-pipeline-step1,
 * UI.md §2): ops-saving / ops-rebase / ops-degraded. На словарь state не
 * расширяемся — стадии меняют label/title внутри зафиксированных состояний
 * и публикуются в view.opsStage для JSX/тестов.
 */
const OPS_STAGE_VIEW = Object.freeze({
  "ops-saving": { state: "saving", label: "Сохранение (дельта)…", title: "Сохраняем изменения дельта-операциями." },
  "ops-rebase": { state: "saving", label: "Синхронизация версии…", title: "Конфликт версий разрешается автоматически: правки применяются к серверной версии." },
  "ops-degraded": { state: "failed", label: "Полное сохранение (дельта недоступна)", title: "Дельта-сохранение недоступно до перезагрузки страницы: работает обычное полное сохранение." },
  // step2 (UI.md §6): локально подтверждено, не ушедшее — буфер durable в IDB;
  // sublabel «ожидает сеть» при offline подаётся отдельным полем view.
  "ops-local": { state: "saved", label: "Сохранено локально", title: "Правки подтверждены локально (буфер надёжен даже при закрытии вкладки) и будут доставлены на сервер." },
  "ops-saved": { state: "saved", label: "Сохранено", title: "Черновик сессии сохранён." },
});

export function buildSaveStatusSlotView({
  saveUploadStatusRaw = null,
  saveSnapshotRaw = null,
  flashRaw = null,
  opsStageRaw = null,
} = {}) {
  const status = asObject(saveUploadStatusRaw);
  const snapshot = asObject(saveSnapshotRaw);
  const flash = asObject(flashRaw);
  const opsStage = toText(opsStageRaw) || toText(status.opsStage);

  const uploadState = toText(status.state);
  let state = "saved";
  if (uploadState === "conflict") state = "conflict";
  else if (uploadState === "saving" || snapshot.isSaving === true) state = "saving";
  else if (uploadState === "save_failed" || snapshot.isFailed === true) state = "failed";
  else if (snapshot.isStale === true) state = "stale";
  else if (snapshot.isDirty === true) state = "dirty";

  // Degraded важнее спокойных состояний: дельта-протокол отказал, full-save
  // fallback активен — пользователь должен видеть это даже при «saved».
  const opsOverride = OPS_STAGE_VIEW[opsStage] || null;
  if (opsOverride && (opsOverride.state === "failed" ? state !== "conflict" : state === "saving" || state === "saved" || state === "dirty")) {
    state = opsOverride.state;
  }

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

  if (opsOverride && state === opsOverride.state) {
    labels[opsOverride.state] = opsOverride.label;
    titles[opsOverride.state] = opsOverride.title;
  }

  const flashMessage = toText(flash.message);
  const flashVisible = flash.visible === true && flashMessage.length > 0;

  // Ф5: async subprocess-sync — ненавязчивый индикатор рядом со статусом
  // «Сохранено». Только для saved-состояния: conflict/failed/stale важнее.
  const subprocessesSyncPending = (
    state === "saved"
    && toText(status.subprocessesSync).toLowerCase() === "pending"
  );

  // step2 (UI.md §6): sublabel «ожидает сеть» при offline — буфер durable в
  // IDB, доставка возобновится сама (прецедент subprocessesSyncLabel).
  const awaitingNetworkLabel = (
    status.opsOffline === true
    && (state === "saved" || state === "saving")
    && !flashVisible
  ) ? "ожидает сеть" : "";

  return {
    state,
    label: labels[state],
    title: titles[state],
    opsStage,
    flashVisible,
    flashLabel: flashVisible ? stripSaveStatusSlotPrefix(flashMessage) : "",
    subprocessesSyncLabel: subprocessesSyncPending ? "Подпроцессы синхронизируются…" : "",
    awaitingNetworkLabel,
  };
}
