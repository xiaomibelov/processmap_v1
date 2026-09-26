import { useSyncExternalStore } from "react";
import {
  getGhostVisibility,
  getTobeOverlayUnderlayState,
  hydrateGhostVisibility,
  subscribeTobeOverlayUnderlay,
} from "./tobeOverlayUnderlayStore.js";

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

// Пресет видимости ghost-подложки (faint/medium/strong). Перед подпиской
// лениво гидрирует persisted-значение из localStorage (idempotent — один раз
// за модуль); дальше getGhostVisibility работает без обращения к storage.
export function useTobeOverlayUnderlayGhostVisibility() {
  hydrateGhostVisibility();
  return useSyncExternalStore(
    subscribeTobeOverlayUnderlay,
    () => getGhostVisibility(),
    () => getGhostVisibility(),
  );
}
