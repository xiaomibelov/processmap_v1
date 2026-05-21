import { useState, useEffect, useCallback } from "react";

/**
 * DiagramEditModeBoundary
 *
 * Manages whether the Diagram tab shows the editable Modeler (editor layer)
 * or the lightweight Viewer (diagram layer).
 *
 * Default: editor mode is ON so element drag works immediately.
 * Only XML view forces viewer mode to avoid accidental mutation.
 */
export function useDiagramEditModeBoundary({ view }) {
  const [forceEditorMode, setForceEditorMode] = useState(true);

  // Reset to editor default when returning to diagram from other tabs,
  // but keep editor active on the diagram tab itself.
  useEffect(() => {
    if (view === "xml") {
      setForceEditorMode(false);
    }
    // NOTE: we intentionally do NOT reset on view === "diagram"
    // because the user expects the canvas to be editable by default.
  }, [view]);

  const enterEditMode = useCallback(() => setForceEditorMode(true), []);
  const exitEditMode = useCallback(() => setForceEditorMode(false), []);

  const isEditorActive = view === "editor" || forceEditorMode;
  const isViewerActive = view === "diagram" && !forceEditorMode;

  return {
    forceEditorMode,
    setForceEditorMode,
    enterEditMode,
    exitEditMode,
    isEditorActive,
    isViewerActive,
  };
}
