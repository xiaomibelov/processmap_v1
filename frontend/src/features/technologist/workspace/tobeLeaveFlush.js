// T0: обработчик flush-before-leave для рабочего места TO BE (embedded).
//
// Корень бага «Сохранение не завершено» при выходе «К проекту» из TO BE:
// App шлёт DOM-событие fpc:processstage_flush_before_leave, но слушатель
// живёт в ProcessStage, который в TO BE-режиме демонтирован (stageOverride
// в AppShell) → никто не отвечает → таймаут 7000мс → баннер LEAVE_FLUSH_FAILED
// даже на чистой сессии, а грязное рабочее место не сохранялось вовсе.
//
// Решение: в embedded-режиме рабочее место само отвечает на flush-событие:
//   - чистое  → { ok: true, skipped } — выход мгновенный, без баннера;
//   - грязное → сохранение черновика шаблона (существующий save-путь) →
//     { ok: true, flushed } либо честный { ok: false, error }.

export function buildTobeLeaveFlushHandler({ isDirty, saveDraft } = {}) {
  const dirty = typeof isDirty === "function" ? isDirty : () => false;
  const save = typeof saveDraft === "function" ? saveDraft : async () => ({ ok: false, error: "save_unavailable" });
  return async function tobeLeaveFlushHandler() {
    if (!dirty()) {
      return { ok: true, skipped: true, reason: "clean_workspace" };
    }
    const result = await save();
    if (result?.ok) {
      return { ok: true, flushed: true, reason: "tobe_workspace_saved" };
    }
    return {
      ok: false,
      error: String(result?.error || "tobe_workspace_save_failed"),
    };
  };
}
