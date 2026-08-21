function toText(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeHybridToolUiState(stateRaw) {
  const state = stateRaw && typeof stateRaw === "object" ? stateRaw : {};
  return {
    visible: !!state.visible,
    mode: toText(state.mode) === "edit" ? "edit" : "view",
    tool: ["select", "rect", "text", "container"].includes(toText(state.tool)) ? toText(state.tool) : "select",
  };
}

export function applyHybridPaletteToolIntent(stateRaw, toolRaw) {
  const state = normalizeHybridToolUiState(stateRaw);
  const tool = ["select", "rect", "text", "container"].includes(toText(toolRaw)) ? toText(toolRaw) : "select";
  if (tool === "select") {
    return {
      ...state,
      visible: true,
      tool: "select",
    };
  }
  return {
    ...state,
    visible: true,
    mode: "edit",
    tool,
  };
}

export function applyHybridPaletteModeIntent(stateRaw, modeRaw) {
  const state = normalizeHybridToolUiState(stateRaw);
  const mode = toText(modeRaw) === "edit" ? "edit" : "view";
  return {
    ...state,
    visible: true,
    mode,
  };
}
