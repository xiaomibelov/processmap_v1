import { toText } from "../adminUtils";

export function updateFilterState(current = {}, patch = {}) {
  return {
    ...current,
    ...patch,
  };
}

export function normalizeSearchTerm(value) {
  return toText(value);
}

