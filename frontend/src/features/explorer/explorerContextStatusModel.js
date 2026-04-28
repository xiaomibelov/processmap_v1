export const EXPLORER_CONTEXT_STATUS_VALUES = ["none", "as_is", "to_be"];

export const EXPLORER_CONTEXT_STATUS_OPTIONS = [
  { value: "none", label: "—" },
  { value: "as_is", label: "AS IS" },
  { value: "to_be", label: "TO BE" },
];

const CONTEXT_STATUS_LABELS = new Map(
  EXPLORER_CONTEXT_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

export function normalizeExplorerContextStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return EXPLORER_CONTEXT_STATUS_VALUES.includes(normalized) ? normalized : "none";
}

export function getExplorerContextStatusLabel(value) {
  const normalized = normalizeExplorerContextStatus(value);
  return CONTEXT_STATUS_LABELS.get(normalized) || "—";
}

export function getExplorerContextStatusOptions() {
  return EXPLORER_CONTEXT_STATUS_OPTIONS.map((option) => ({ ...option }));
}

export function isExplorerContextStatusEditable(item) {
  return String(item?.type || "").trim().toLowerCase() === "folder";
}
