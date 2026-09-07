// React-обёртка над ядром saveUploadLifecycle.js.
// Контур canvas-save-pipeline-extraction-v1. MOVE, NOT REWRITE: заменяет
// useState (:676), ref таймера (:644), cleanup-effect (:2410-2417) и
// useCallback-обработчик onBpmnSaveLifecycleEvent (:2419-2439) ProcessStage.
// Возвращаемые колбэки стабильны ([]-memo) — прежний обработчик тоже имел
// deps []. onConflictEvent хранится в ref-маршруте (паттерн BpmnStage
// ref-маршрутов), чтобы свежий closure не ломал стабильность колбэков.

import { useCallback, useEffect, useRef, useState } from "react";

import { createSaveUploadLifecycle, IDLE_SAVE_UPLOAD_EVENT } from "./saveUploadLifecycle.js";
import { createSaveStatusEmitDebouncer } from "./saveStatusEmitDebounce.js";

export function useSaveUploadLifecycle({ onConflictEvent } = {}) {
  const [saveUploadLifecycleEvent, setSaveUploadLifecycleEvent] = useState(IDLE_SAVE_UPLOAD_EVENT);
  const onConflictEventRef = useRef(onConflictEvent);
  onConflictEventRef.current = onConflictEvent;

  // RC4-п.5: эмиты в React-state debounce'атся (≥300мс, не чаще раза в 500мс),
  // conflict/failed проходят немедленно. Ядро жизненного цикла не меняется.
  const emitDebouncerRef = useRef(null);
  if (emitDebouncerRef.current === null) {
    emitDebouncerRef.current = createSaveStatusEmitDebouncer({
      onEmit: setSaveUploadLifecycleEvent,
    });
  }

  const lifecycleRef = useRef(null);
  if (lifecycleRef.current === null) {
    lifecycleRef.current = createSaveUploadLifecycle({
      onConflictEvent: (next) => onConflictEventRef.current?.(next),
      onChange: (next) => emitDebouncerRef.current?.schedule(next),
    });
  }

  // Прежний cleanup-effect на unmount: отмена armed-clear таймера + сброс
  // pending-эмита debouncer'а.
  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    return () => {
      lifecycle?.dispose();
      emitDebouncerRef.current?.dispose();
    };
  }, []);

  const onBpmnSaveLifecycleEvent = useCallback((eventRaw = null) => {
    lifecycleRef.current?.handleLifecycleEvent(eventRaw);
  }, []);

  const resetSaveUploadLifecycleForRevisionPublish = useCallback(() => {
    lifecycleRef.current?.resetForRevisionPublish();
  }, []);

  const applySaveUploadLifecycleConflictReset = useCallback((reason) => {
    lifecycleRef.current?.applyConflictReset(reason);
  }, []);

  return {
    saveUploadLifecycleEvent,
    onBpmnSaveLifecycleEvent,
    resetSaveUploadLifecycleForRevisionPublish,
    applySaveUploadLifecycleConflictReset,
  };
}
