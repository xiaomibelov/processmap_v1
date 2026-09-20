import { useSyncExternalStore } from "react";
import { getTobeOverlayMockState, subscribeTobeOverlayMock } from "./mockOverlayModeStore.js";

export function useTobeOverlayMockActive() {
  return useSyncExternalStore(
    subscribeTobeOverlayMock,
    () => getTobeOverlayMockState().active,
    () => getTobeOverlayMockState().active,
  );
}

export function useTobeOverlayMockGhostVisible() {
  return useSyncExternalStore(
    subscribeTobeOverlayMock,
    () => getTobeOverlayMockState().ghostVisible,
    () => getTobeOverlayMockState().ghostVisible,
  );
}
