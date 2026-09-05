// Save-upload lifecycle: ядро (не-React).
// Контур canvas-save-pipeline-extraction-v1. MOVE, NOT REWRITE: перенос
// дословно из components/ProcessStage.jsx (53b51f06): IDLE_SAVE_UPLOAD_EVENT
// (:430-444), состояние события (:676), ref таймера (:644), cleanup-effect
// (:2410-2417) и обработчик onBpmnSaveLifecycleEvent (:2419-2439). Порядок
// операций, значение 4200мс и условия armed-clear не менялись.

import { normalizeBpmnSaveLifecycleEvent } from "../../navigation/saveUploadStatus.js";

export const IDLE_SAVE_UPLOAD_EVENT = Object.freeze({
  event: "",
  stage: "idle",
  state: "saved",
  at: 0,
  reason: "",
  sessionId: "",
  rev: 0,
  status: 0,
  xmlBytes: 0,
  errorCode: "",
  error: "",
  errorDetails: null,
  conflict: null,
});

// createSaveUploadLifecycle — stateful-машина жизненного цикла save-события.
// Заменяет пару useState/useRef + useCallback-обработчик ProcessStage.
//   onConflictEvent — то, что раньше делал conflict-ветка обработчика
//     (setSaveConflictNoticeDismissed(false)) строго ДО установки события.
//   onChange — синк состояния в React (прежний setSaveUploadLifecycleEvent).
// Порядок в handleLifecycleEvent повторяет прежний обработчик 1:1:
// normalize → guard idle → conflict-dismiss → установка события → отмена
// предыдущего таймера → armed-clear 4200мс (только persisted/skipped_unchanged,
// отмена по identity Number(event?.at)===stableAt).
export function createSaveUploadLifecycle({ onConflictEvent, onChange } = {}) {
  let event = IDLE_SAVE_UPLOAD_EVENT;
  let clearTimer = 0;

  const emit = () => {
    onChange?.(event);
  };

  return {
    getEvent() {
      return event;
    },
    handleLifecycleEvent(raw = null) {
      const next = normalizeBpmnSaveLifecycleEvent(raw);
      if (!next.stage || next.stage === "idle") return;
      if (next.stage === "conflict") {
        onConflictEvent?.(next);
      }
      event = next;
      emit();
      if (clearTimer) {
        globalThis.clearTimeout(clearTimer);
        clearTimer = 0;
      }
      if (next.stage === "persisted" || next.stage === "skipped_unchanged") {
        const stableAt = Number(next.at || Date.now());
        clearTimer = globalThis.setTimeout(() => {
          if (Number(event?.at || 0) === stableAt) {
            event = IDLE_SAVE_UPLOAD_EVENT;
            emit();
          }
          clearTimer = 0;
        }, 4200);
      }
    },
    // Прежние set-call sites setSaveUploadLifecycleEvent(IDLE_SAVE_UPLOAD_EVENT)
    // (ProcessStage.jsx:1621, :2459, :2540, :2632).
    resetForRevisionPublish() {
      event = IDLE_SAVE_UPLOAD_EVENT;
      emit();
    },
    // Прежние set-call sites setSaveUploadLifecycleEvent((prev) => ({...prev,
    // payload: {...(prev?.payload||{}), status:409, error_code, error_details}}))
    // (ProcessStage.jsx:2519, :2610).
    applyConflictReset(reason) {
      event = {
        ...event,
        payload: {
          ...(event?.payload || {}),
          status: 409,
          error_code: "DIAGRAM_STATE_CONFLICT",
          error_details: reason,
        },
      };
      emit();
    },
    // Прежний cleanup-effect на unmount (ProcessStage.jsx:2410-2417).
    dispose() {
      if (clearTimer) {
        globalThis.clearTimeout(clearTimer);
        clearTimer = 0;
      }
    },
  };
}
