import { useSyncExternalStore } from "react";
import { getTobeOverlayUnderlayState, subscribeTobeOverlayUnderlay } from "./tobeOverlayUnderlayStore.js";

export function useTobeOverlayUnderlayActive() {
  return useSyncExternalStore(
    subscribeTobeOverlayUnderlay,
    () => getTobeOverlayUnderlayState().active,
    () => getTobeOverlayUnderlayState().active,
  );
}

export function useTobeOverlayUnderlayVisible() {
  return useSyncExternalStore(
    subscribeTobeOverlayUnderlay,
    () => getTobeOverlayUnderlayState().visible,
    () => getTobeOverlayUnderlayState().visible,
  );
}

export function useTobeOverlayUnderlayAvailable() {
  return useSyncExternalStore(
    subscribeTobeOverlayUnderlay,
    () => getTobeOverlayUnderlayState().available,
    () => getTobeOverlayUnderlayState().available,
  );
}
