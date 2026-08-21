import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildNodePathComparableSnapshot,
  deriveNodePathSyncState,
  hasNodePathLocalChanges,
  normalizeNodePathTag,
  normalizeSequenceKey,
} from "../../../components/sidebar/nodePathSyncState.js";

const NODE_PATH_TAG_ORDER = ["P0", "P1", "P2"];
const EMPTY_SNAPSHOT = buildNodePathComparableSnapshot(null);

function buildSafeSnapshot(raw) {
  return buildNodePathComparableSnapshot(raw);
}

function readLifecycleIssue(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const code = String(src._lifecycle_code || "").trim();
  const message = String(src._lifecycle_error || "").trim();
  return code || message ? { code, message } : null;
}

export function deriveNodePathModuleViewState({
  sharedSnapshot,
  localDraft,
  isApplying = false,
  applyFailed = false,
  needsAttention = false,
  isOffline = false,
} = {}) {
  const savedSnapshot = buildSafeSnapshot(sharedSnapshot);
  const draftSnapshot = buildSafeSnapshot(localDraft);
  const hasLocalChanges = hasNodePathLocalChanges({
    draft: draftSnapshot,
    saved: savedSnapshot,
  });
  return {
    sharedSnapshot: savedSnapshot,
    localDraft: draftSnapshot,
    hasLocalChanges,
    syncState: deriveNodePathSyncState({
      isSyncing: isApplying,
      hasError: applyFailed,
      needsAttention,
      isOffline,
      hasLocalChanges,
    }),
  };
}

function readSharedSnapshot(adapter, nodeId) {
  if (typeof adapter?.readSharedSnapshot === "function") return adapter.readSharedSnapshot(nodeId);
  if (typeof adapter?.read === "function") return adapter.read(nodeId);
  return null;
}

async function applyDraft(adapter, payload) {
  if (typeof adapter?.applyDraft === "function") return adapter.applyDraft(payload);
  if (typeof adapter?.apply === "function") return adapter.apply(payload);
  return { ok: false, error: "Node-path bridge недоступен.", snapshot: buildSafeSnapshot(payload?.draft) };
}

async function clearSharedSnapshot(adapter, payload) {
  if (typeof adapter?.clearSharedSnapshot === "function") return adapter.clearSharedSnapshot(payload);
  if (typeof adapter?.reset === "function") return adapter.reset(payload);
  return { ok: false, error: "Node-path bridge недоступен.", snapshot: EMPTY_SNAPSHOT };
}

function hasSnapshotData(snapshotRaw) {
  const snapshot = buildSafeSnapshot(snapshotRaw);
  return snapshot.paths.length > 0 || !!snapshot.sequence_key;
}

export function useNodePathModuleController({
  enabled = false,
  nodeId = "",
  editable = false,
  disabled = false,
  adapter = null,
  snapshotVersion = "",
} = {}) {
  const [sharedSnapshot, setSharedSnapshot] = useState(EMPTY_SNAPSHOT);
  const [localDraft, setLocalDraft] = useState(EMPTY_SNAPSHOT);
  const [isApplying, setIsApplying] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);
  const [needsAttention, setNeedsAttention] = useState(false);
  const [isOffline, setIsOffline] = useState(() => (
    typeof navigator !== "undefined" ? navigator.onLine === false : false
  ));
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const nodeScopedStateByNodeIdRef = useRef(new Map());
  const dirtyBaselineByNodeIdRef = useRef(new Map());
  const sharedSnapshotRef = useRef(EMPTY_SNAPSHOT);
  const localDraftRef = useRef(EMPTY_SNAPSHOT);

  function readNodeScopedState(nextNodeId, fallbackSharedSnapshot = EMPTY_SNAPSHOT) {
    const normalizedNodeId = String(nextNodeId || "").trim();
    if (!normalizedNodeId) {
      return {
        sharedSnapshot: EMPTY_SNAPSHOT,
        localDraft: EMPTY_SNAPSHOT,
        applyFailed: false,
        needsAttention: false,
        errorMessage: "",
        infoMessage: "",
      };
    }
    const cached = nodeScopedStateByNodeIdRef.current.get(normalizedNodeId);
    const fallbackSnapshot = buildSafeSnapshot(fallbackSharedSnapshot);
    const cachedSharedSnapshot = buildSafeSnapshot(cached?.sharedSnapshot);
    const nextSharedSnapshot = hasSnapshotData(fallbackSnapshot) ? fallbackSnapshot : cachedSharedSnapshot;
    const cachedLocalDraft = buildSafeSnapshot(cached?.localDraft || cachedSharedSnapshot);
    const cachedHasLocalChanges = hasNodePathLocalChanges({
      draft: cachedLocalDraft,
      saved: cachedSharedSnapshot,
    });
    return {
      sharedSnapshot: nextSharedSnapshot,
      localDraft: cachedHasLocalChanges ? cachedLocalDraft : nextSharedSnapshot,
      applyFailed: !!cached?.applyFailed,
      needsAttention: !!cached?.needsAttention,
      errorMessage: String(cached?.errorMessage || ""),
      infoMessage: String(cached?.infoMessage || ""),
    };
  }

  function writeNodeScopedState(nextNodeId, value) {
    const normalizedNodeId = String(nextNodeId || "").trim();
    if (!normalizedNodeId) return;
    nodeScopedStateByNodeIdRef.current.set(normalizedNodeId, {
      sharedSnapshot: buildSafeSnapshot(value?.sharedSnapshot),
      localDraft: buildSafeSnapshot(value?.localDraft),
      applyFailed: !!value?.applyFailed,
      needsAttention: !!value?.needsAttention,
      errorMessage: String(value?.errorMessage || ""),
      infoMessage: String(value?.infoMessage || ""),
    });
  }

  useEffect(() => {
    sharedSnapshotRef.current = sharedSnapshot;
  }, [sharedSnapshot]);

  useEffect(() => {
    localDraftRef.current = localDraft;
  }, [localDraft]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof adapter?.subscribeConnectivity === "function") {
      return adapter.subscribeConnectivity((isOnline) => {
        setIsOffline(isOnline === false);
      });
    }
    if (typeof window === "undefined") return undefined;
    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const nextSnapshot = editable && nodeId ? buildSafeSnapshot(readSharedSnapshot(adapter, nodeId)) : EMPTY_SNAPSHOT;
    const nextState = editable && nodeId
      ? readNodeScopedState(nodeId, nextSnapshot)
      : readNodeScopedState("", EMPTY_SNAPSHOT);
    sharedSnapshotRef.current = nextState.sharedSnapshot;
    localDraftRef.current = nextState.localDraft;
    setErrorMessage(nextState.errorMessage);
    setInfoMessage(nextState.infoMessage);
    setIsApplying(false);
    setApplyFailed(nextState.applyFailed);
    setNeedsAttention(nextState.needsAttention);
    setSharedSnapshot(nextState.sharedSnapshot);
    setLocalDraft(nextState.localDraft);
  }, [enabled, editable, nodeId]);

  useEffect(() => {
    if (!enabled || !editable || !nodeId) return;
    const nextSharedSnapshotRaw = readSharedSnapshot(adapter, nodeId);
    const nextSharedSnapshot = buildSafeSnapshot(nextSharedSnapshotRaw);
    const lifecycleIssue = readLifecycleIssue(nextSharedSnapshotRaw);
    const currentLocalDraft = localDraftRef.current;
    const currentSharedSnapshot = sharedSnapshotRef.current;
    const hasLocalChanges = hasNodePathLocalChanges({
      draft: currentLocalDraft,
      saved: currentSharedSnapshot,
    });
    setSharedSnapshot(nextSharedSnapshot);
    setApplyFailed(!!lifecycleIssue);
    setErrorMessage(lifecycleIssue?.message || "");
    if (!hasLocalChanges) {
      setLocalDraft(nextSharedSnapshot);
    }
  }, [enabled, editable, nodeId, snapshotVersion, adapter]);

  useEffect(() => {
    if (!enabled || !editable || !nodeId || typeof adapter?.subscribe !== "function") return undefined;
    return adapter.subscribe(nodeId, (nextSnapshotRaw) => {
      const nextSharedSnapshot = buildSafeSnapshot(nextSnapshotRaw);
      const lifecycleIssue = readLifecycleIssue(nextSnapshotRaw);
      const currentLocalDraft = localDraftRef.current;
      const currentSharedSnapshot = sharedSnapshotRef.current;
      const hasLocalChanges = hasNodePathLocalChanges({
        draft: currentLocalDraft,
        saved: currentSharedSnapshot,
      });
      setSharedSnapshot(nextSharedSnapshot);
      setApplyFailed(!!lifecycleIssue);
      setErrorMessage(lifecycleIssue?.message || "");
      if (!hasLocalChanges) {
        setLocalDraft(nextSharedSnapshot);
      }
    });
  }, [enabled, editable, nodeId, adapter]);

  useEffect(() => {
    if (!enabled || !editable || !nodeId) return;
    writeNodeScopedState(nodeId, {
      sharedSnapshot,
      localDraft,
      applyFailed,
      needsAttention,
      errorMessage,
      infoMessage,
    });
  }, [enabled, editable, nodeId, sharedSnapshot, localDraft, applyFailed, needsAttention, errorMessage, infoMessage]);

  const derivedViewState = useMemo(() => deriveNodePathModuleViewState({
    sharedSnapshot,
    localDraft,
    isApplying,
    applyFailed,
    needsAttention,
    isOffline,
  }), [sharedSnapshot, localDraft, isApplying, applyFailed, needsAttention, isOffline]);

  useEffect(() => {
    if (!enabled) return;
    const normalizedNodeId = String(nodeId || "").trim();
    const dirtyRef = dirtyBaselineByNodeIdRef.current.get(normalizedNodeId) || { nodeId: "", snapshot: null };
    if (!editable || !nodeId || !derivedViewState.hasLocalChanges) {
      if (dirtyRef.snapshot) {
        dirtyBaselineByNodeIdRef.current.delete(normalizedNodeId);
      }
      setNeedsAttention(false);
      return;
    }
    if (!dirtyRef.snapshot || dirtyRef.nodeId !== nodeId) {
      dirtyBaselineByNodeIdRef.current.set(normalizedNodeId, {
        nodeId,
        snapshot: derivedViewState.sharedSnapshot,
      });
      setNeedsAttention(false);
      return;
    }
    const baselineDrifted = hasNodePathLocalChanges({
      draft: derivedViewState.sharedSnapshot,
      saved: dirtyRef.snapshot,
    });
    setNeedsAttention((prev) => (baselineDrifted ? true : (prev && derivedViewState.hasLocalChanges)));
  }, [enabled, editable, nodeId, derivedViewState.hasLocalChanges, derivedViewState.sharedSnapshot]);

  function clearTransientState({ clearAttention = true } = {}) {
    setApplyFailed(false);
    setErrorMessage("");
    if (clearAttention) setNeedsAttention(false);
  }

  function toggleTag(tagRaw) {
    if (!enabled) return;
    const tag = normalizeNodePathTag(tagRaw);
    if (!tag) return;
    clearTransientState({ clearAttention: true });
    setLocalDraft((prevRaw) => {
      const prev = buildSafeSnapshot(prevRaw);
      const hasTag = prev.paths.includes(tag);
      const nextPaths = hasTag
        ? prev.paths.filter((item) => item !== tag)
        : [...prev.paths, tag].sort((a, b) => NODE_PATH_TAG_ORDER.indexOf(a) - NODE_PATH_TAG_ORDER.indexOf(b));
      return buildSafeSnapshot({
        ...prev,
        paths: nextPaths,
      });
    });
  }

  function updateSequenceKey(value) {
    if (!enabled) return;
    clearTransientState({ clearAttention: true });
    setLocalDraft((prevRaw) => buildSafeSnapshot({
      ...buildSafeSnapshot(prevRaw),
      sequence_key: normalizeSequenceKey(value),
    }));
  }

  async function apply() {
    if (!enabled || !editable || !nodeId) return;
    if ((!adapter?.applyDraft && !adapter?.apply) || disabled || isApplying) return;
    const normalizedDraft = buildSafeSnapshot(localDraftRef.current);
    if (!normalizedDraft.paths.length) {
      setApplyFailed(false);
      setErrorMessage("Выберите хотя бы один path-tag (P0/P1/P2).");
      return;
    }
    setIsApplying(true);
    setApplyFailed(false);
    setNeedsAttention(false);
    setErrorMessage("");
    setInfoMessage("");
    try {
      const result = await Promise.resolve(applyDraft(adapter, {
        nodeId,
        draft: normalizedDraft,
      }));
      if (result && result.ok === false) {
        setApplyFailed(true);
        setErrorMessage(String(result.error || "Не удалось сохранить разметку узла."));
        return;
      }
      const acceptedSnapshot = buildSafeSnapshot(result?.snapshot || normalizedDraft);
      dirtyBaselineByNodeIdRef.current.delete(String(nodeId || "").trim());
      setSharedSnapshot(acceptedSnapshot);
      setLocalDraft(acceptedSnapshot);
      setApplyFailed(false);
      setNeedsAttention(false);
      setInfoMessage("Разметка узла сохранена.");
    } catch (error) {
      setApplyFailed(true);
      setErrorMessage(String(error?.message || error || "Не удалось сохранить разметку узла."));
    } finally {
      setIsApplying(false);
    }
  }

  async function reset() {
    if (!enabled || !editable || !nodeId) return;
    if ((!adapter?.clearSharedSnapshot && !adapter?.reset) || disabled || isApplying) return;
    setIsApplying(true);
    setApplyFailed(false);
    setNeedsAttention(false);
    setErrorMessage("");
    setInfoMessage("");
    try {
      const result = await Promise.resolve(clearSharedSnapshot(adapter, { nodeId }));
      if (result && result.ok === false) {
        setApplyFailed(true);
        setErrorMessage(String(result.error || "Не удалось сбросить разметку узла."));
        return;
      }
      const acceptedSnapshot = buildSafeSnapshot(result?.snapshot);
      dirtyBaselineByNodeIdRef.current.delete(String(nodeId || "").trim());
      setSharedSnapshot(acceptedSnapshot);
      setLocalDraft(acceptedSnapshot);
      setApplyFailed(false);
      setNeedsAttention(false);
      setInfoMessage("Разметка узла сброшена.");
    } catch (error) {
      setApplyFailed(true);
      setErrorMessage(String(error?.message || error || "Не удалось сбросить разметку узла."));
    } finally {
      setIsApplying(false);
    }
  }

  function acceptShared() {
    if (!enabled || !editable || !nodeId || disabled || isApplying) return;
    const acceptedSnapshot = buildSafeSnapshot(sharedSnapshotRef.current);
    dirtyBaselineByNodeIdRef.current.delete(String(nodeId || "").trim());
    setApplyFailed(false);
    setNeedsAttention(false);
    setErrorMessage("");
    setInfoMessage("Используется сохранённая версия.");
    setLocalDraft(acceptedSnapshot);
  }

  return {
    paths: derivedViewState.localDraft.paths,
    sequenceKey: derivedViewState.localDraft.sequence_key,
    sharedSnapshot: derivedViewState.sharedSnapshot,
    syncState: derivedViewState.syncState,
    busy: isApplying,
    err: errorMessage,
    info: infoMessage,
    hasLocalChanges: derivedViewState.hasLocalChanges,
    needsAttention,
    isOffline,
    adapterReady: !!(adapter && (
      typeof adapter.readSharedSnapshot === "function"
      || typeof adapter.read === "function"
    )),
    toggleTag,
    updateSequenceKey,
    apply,
    reset,
    acceptShared,
  };
}
