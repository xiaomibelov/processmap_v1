import { useEffect, useRef } from "react";
import {
  createOverlayLifecycleManager,
  uninstallOverlayBadgeTooltipListener,
} from "./overlayLifecycleManager";

/**
 * React hook wrapper around OverlayLifecycleManager.
 *
 * Handles mount/clear/diff of V2 extension overlays and global tooltip/card-hover
 * listeners. Cleans up on unmount.
 */
export function useOverlayLifecycle({
  v2EnabledRef,
  v2ExpandedRef,
  useExtensionOverlays,
}) {
  const useExtensionOverlaysRef = useRef(useExtensionOverlays);
  useExtensionOverlaysRef.current = useExtensionOverlays;

  const managerRef = useRef(null);

  if (!managerRef.current) {
    managerRef.current = createOverlayLifecycleManager({
      enabledRef: v2EnabledRef,
      expandedRef: v2ExpandedRef,
      useExtensionOverlaysRef,
    });
  }

  useEffect(() => {
    return () => {
      uninstallOverlayBadgeTooltipListener();
    };
  }, []);

  return managerRef.current;
}
