// T2: модель dirty-guard выхода из режима TO BE.
//
// Требование: модал подтверждения при несохранённых правках на ВСЕХ путях
// выхода из TO BE (сегмент «Схема», «← К схеме», «← Вернуться к сессии»,
// ws-close, «← К проекту»). Решения владельца: origin входа не запоминаем
// (возврат всегда в «Схему» текущей сессии), кнопки-дубли — alias на единый
// exit, confirm — styled-модал (TobeLeaveConfirmModal), не нативный confirm.

export const TOBE_LEAVE_SAVE = "save";
export const TOBE_LEAVE_DISCARD = "discard";
export const TOBE_LEAVE_CANCEL = "cancel";

export function shouldConfirmTobeLeave({ tobeActive = false, dirty = false } = {}) {
  return tobeActive === true && dirty === true;
}

export function isTobeLeaveChoice(value) {
  return value === TOBE_LEAVE_SAVE || value === TOBE_LEAVE_DISCARD || value === TOBE_LEAVE_CANCEL;
}
