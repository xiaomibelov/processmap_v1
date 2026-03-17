import { normalizeSessionCompanion } from "./sessionCompanionContracts.js";

function toText(value) {
  return String(value || "").trim();
}

export function createLiveDocumentJazzAdapter({
  adapterMode = "legacy",
  jazzAdapter = null,
  legacySnapshotRaw = null,
} = {}) {
  const mode = toText(adapterMode).toLowerCase() === "jazz" ? "jazz" : "legacy";
  const readLegacySnapshot = () => normalizeSessionCompanion(legacySnapshotRaw);
  const readJazzSnapshot = () => (
    jazzAdapter && typeof jazzAdapter.readSharedSnapshot === "function"
      ? normalizeSessionCompanion(jazzAdapter.readSharedSnapshot())
      : normalizeSessionCompanion({})
  );

  return {
    mode,
    isJazzBacked: mode === "jazz",
    readLiveSnapshot() {
      return mode === "jazz" ? readJazzSnapshot() : readLegacySnapshot();
    },
    subscribeLiveSnapshot(listener) {
      if (mode !== "jazz" || !jazzAdapter || typeof jazzAdapter.subscribe !== "function") {
        return () => {};
      }
      return jazzAdapter.subscribe((nextSnapshot) => {
        listener?.(normalizeSessionCompanion(nextSnapshot));
      });
    },
    async applyLiveSnapshot(snapshotRaw) {
      const snapshot = normalizeSessionCompanion(snapshotRaw);
      if (mode !== "jazz" || !jazzAdapter || typeof jazzAdapter.applySnapshot !== "function") {
        return { ok: false, blocked: "legacy_mode", error: "live_document_jazz_adapter_not_active" };
      }
      return jazzAdapter.applySnapshot({ snapshot });
    },
  };
}

