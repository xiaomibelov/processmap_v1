import { useSyncExternalStore } from "react";

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
