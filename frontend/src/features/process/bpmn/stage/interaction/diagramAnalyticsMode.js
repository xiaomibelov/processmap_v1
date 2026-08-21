export function createAnalyticsModeRef(initial = "analytics") {
  return { current: initial };
}

export function isDiagramAnalyticsMode(modeRef) {
  return String(modeRef?.current || "") === "analytics";
}

export function isDiagramEditMode(modeRef) {
  return String(modeRef?.current || "") === "edit";
}

export function shouldUseEditorSelection(modeRef) {
  return isDiagramEditMode(modeRef);
}

export function enterDiagramEditMode(modeRef) {
  if (modeRef) {
    modeRef.current = "edit";
  }
}

export function enterDiagramAnalyticsMode(modeRef) {
  if (modeRef) {
    modeRef.current = "analytics";
  }
}
