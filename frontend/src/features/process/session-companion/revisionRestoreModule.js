import { restoreRevisionAsNewLatest } from "./revisionLedgerModule.js";

export function buildRevisionRestoreTransition(companionRaw, options = {}) {
  return restoreRevisionAsNewLatest(companionRaw, options);
}

