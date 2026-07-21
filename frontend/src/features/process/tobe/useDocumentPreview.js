import { useCallback, useReducer } from "react";

const INITIAL_STATE = { doc: null, view: null, anchorRect: null, anchorElementName: "" };

// Ephemeral preview state for To-Be documents: which document is open and at
// which level ("popover" near the canvas card / centered, or "modal"
// expanded). Opening another document replaces the current one.
export function documentPreviewReducer(state, action) {
  switch (action?.type) {
    case "open": {
      const doc = action.doc && typeof action.doc === "object" ? action.doc : null;
      if (!doc) return state;
      return {
        doc,
        view: action.view === "modal" ? "modal" : "popover",
        anchorRect: action.anchorRect || null,
        anchorElementName: String(action.anchorElementName || "").trim(),
      };
    }
    case "expand":
      return state.doc ? { ...state, view: "modal" } : state;
    case "collapse":
      return state.doc ? { ...state, view: "popover" } : state;
    case "close":
      return INITIAL_STATE;
    default:
      return state;
  }
}

export function useDocumentPreview() {
  const [state, dispatch] = useReducer(documentPreviewReducer, INITIAL_STATE);

  const openDocumentPreview = useCallback((doc, options = {}) => {
    dispatch({ type: "open", doc, ...options });
  }, []);
  const expand = useCallback(() => dispatch({ type: "expand" }), []);
  const collapse = useCallback(() => dispatch({ type: "collapse" }), []);
  const close = useCallback(() => dispatch({ type: "close" }), []);

  return {
    activeDocument: state.doc,
    view: state.view,
    anchorRect: state.anchorRect,
    anchorElementName: state.anchorElementName,
    openDocumentPreview,
    expand,
    collapse,
    close,
  };
}
