// Глобальный Ctrl/Cmd+S (контур canvas-save-hot-path-v1, коммит 4).
// keydown ctrl/meta+S → preventDefault → путь ручного сохранения (тот же,
// что у кнопки). Guard isEditableKeyTarget по образцу BpmnStage copy/paste:
// не перехватываем в input/textarea/select/contenteditable. Хендлер
// предназначен для window-листенера — работает независимо от фокуса на canvas.

import { isEditableKeyTarget } from "../stage/runtimeHelpers/bpmnStagePureHelpers.js";

export function isCtrlSaveShortcutEvent(event) {
  if (!event) return false;
  if (event.repeat) return false;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
  return String(event.key || "").toLowerCase() === "s";
}

export function createCtrlSaveKeydownHandler({ onSave, isEditableTarget = isEditableKeyTarget } = {}) {
  return function onCtrlSaveKeyDown(event) {
    if (!isCtrlSaveShortcutEvent(event)) return false;
    if (typeof isEditableTarget === "function" && isEditableTarget(event?.target)) return false;
    if (typeof event?.preventDefault === "function") event.preventDefault();
    if (typeof onSave === "function") onSave();
    return true;
  };
}
