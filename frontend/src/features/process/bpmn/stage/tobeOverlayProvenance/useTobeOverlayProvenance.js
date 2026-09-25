import { useSyncExternalStore } from "react";

import {
  getTobeProvenanceEmptyHintState,
  subscribeTobeProvenanceEmptyHint,
} from "./tobeProvenanceEmptyState.js";
import {
  getTobeOverlayProvenanceState,
  subscribeTobeOverlayProvenance,
} from "./tobeOverlayProvenanceStore.js";

// Хуки provenance-индекса TO BE (T8) — образец useTobeOverlayUnderlay.js:
// useSyncExternalStore поверх module-store, без prop-drilling.

export function useTobeOverlayProvenanceStatus() {
  return useSyncExternalStore(
    subscribeTobeOverlayProvenance,
    () => getTobeOverlayProvenanceState().status,
    () => getTobeOverlayProvenanceState().status,
  );
}

export function useTobeOverlayProvenanceIndex() {
  return useSyncExternalStore(
    subscribeTobeOverlayProvenance,
    () => getTobeOverlayProvenanceState().index,
    () => getTobeOverlayProvenanceState().index,
  );
}

// T11: видимость empty-state hint — status empty И первый selection был И
// не dismissed. getSnapshot возвращает ПРИМИТИВ (boolean): свежий объект из
// getState ломал бы useSyncExternalStore (maximum update depth).
export function useTobeProvenanceEmptyHintVisible(provenanceStatus) {
  return useSyncExternalStore(
    subscribeTobeProvenanceEmptyHint,
    () => {
      const hint = getTobeProvenanceEmptyHintState();
      return provenanceStatus === "empty" && hint.selectionSeen && !hint.dismissed;
    },
    () => {
      const hint = getTobeProvenanceEmptyHintState();
      return provenanceStatus === "empty" && hint.selectionSeen && !hint.dismissed;
    },
  );
}
