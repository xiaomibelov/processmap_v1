import { useCallback, useEffect, useRef, useState } from "react";
import { uid } from "../../../lib/ids";
import {
  buildSessionVersionToken,
  decideRemoteSessionApplyScope,
  decideRemoteSessionSyncAction,
} from "./liveSessionSyncV1";

const LIVE_SESSION_SYNC_POLL_MS = 4_000;
const REALTIME_BPMN_OPS_POLL_MS = 600;

function toText(value) {
  return String(value || "").trim();
}

function parseBool(value, fallback = false) {
  const text = toText(value).toLowerCase();
  if (!text) return fallback;
  if (text === "1" || text === "true" || text === "yes" || text === "on") return true;
  if (text === "0" || text === "false" || text === "no" || text === "off") return false;
  return fallback;
}

function resolveRealtimeBpmnOpsEnabled(explicitFlag) {
  if (typeof explicitFlag === "boolean") return explicitFlag;
  const env = (typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env === "object")
    ? import.meta.env
    : {};
  const ownerState = toText(env?.VITE_DIAGRAM_OWNER_STATE).toLowerCase();
  const rollbackTrigger = parseBool(env?.VITE_DIAGRAM_JAZZ_ROLLBACK_TRIGGER, false);
  if (ownerState === "rollback_to_legacy" || rollbackTrigger) return false;
  return true;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function shouldLogBpmnTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_BPMN__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_bpmn") || "").trim() === "1";
  } catch {
    return false;
  }
}

export default function useSessionSyncCoordinator({
  draftSessionId,
  draftBpmnMeta,
  isLocalSessionId,
  liveSyncLocalVersionToken,
  hasUnsafeLocalSyncState,
  onSessionSync,
  normalizeBpmnMeta,
  apiGetSession,
  apiGetSessionSyncState,
  apiGetSessionCollabState,
  apiGetSessionRealtimeOps,
  apiPostSessionRealtimeOps,
  enableRealtimeBpmnOps,
} = {}) {
  const [remoteSessionSyncState, setRemoteSessionSyncState] = useState({
    mode: "idle",
    remoteToken: "",
    remoteBpmnToken: "",
    remoteCollabToken: "",
    updatedAt: 0,
    error: "",
  });

  const remoteSessionSyncSeqRef = useRef(0);
  const remoteSessionSyncInFlightRef = useRef(false);
  const remoteSessionSyncAcknowledgedTokenRef = useRef("");
  const remoteSessionSyncBpmnTokenRef = useRef("");
  const remoteSessionSyncCollabTokenRef = useRef("");

  const realtimeBpmnOpsClientIdRef = useRef(`rt_${uid()}`);
  const realtimeBpmnOpsLastSeqRef = useRef(0);
  const realtimeBpmnOpsPollSeqRef = useRef(0);
  const realtimeBpmnOpsGapDetectedRef = useRef(false);
  const realtimeBpmnOpsSessionRef = useRef("");

  const onSessionSyncRef = useRef(onSessionSync);
  useEffect(() => {
    onSessionSyncRef.current = onSessionSync;
  }, [onSessionSync]);

  const liveSyncLocalVersionTokenRef = useRef(toText(liveSyncLocalVersionToken));
  useEffect(() => {
    liveSyncLocalVersionTokenRef.current = toText(liveSyncLocalVersionToken);
  }, [liveSyncLocalVersionToken]);

  const hasUnsafeLocalSyncStateRef = useRef(hasUnsafeLocalSyncState === true);
  useEffect(() => {
    hasUnsafeLocalSyncStateRef.current = hasUnsafeLocalSyncState === true;
  }, [hasUnsafeLocalSyncState]);

  useEffect(() => {
    const sid = toText(draftSessionId);
    if (!sid || isLocalSessionId?.(sid)) {
      remoteSessionSyncAcknowledgedTokenRef.current = "";
      remoteSessionSyncBpmnTokenRef.current = "";
      remoteSessionSyncCollabTokenRef.current = "";
      return;
    }
    const localToken = toText(liveSyncLocalVersionTokenRef.current);
    if (localToken) {
      remoteSessionSyncAcknowledgedTokenRef.current = localToken;
    }
  }, [draftSessionId, isLocalSessionId]);

  useEffect(() => {
    const sid = toText(draftSessionId);
    if (!sid || isLocalSessionId?.(sid)) return;
    const localToken = toText(liveSyncLocalVersionToken);
    if (!localToken) return;
    remoteSessionSyncAcknowledgedTokenRef.current = localToken;
  }, [draftSessionId, isLocalSessionId, liveSyncLocalVersionToken]);

  useEffect(() => {
    const sid = toText(draftSessionId);
    if (sid === toText(realtimeBpmnOpsSessionRef.current)) return;
    realtimeBpmnOpsSessionRef.current = sid;
    realtimeBpmnOpsLastSeqRef.current = 0;
    realtimeBpmnOpsGapDetectedRef.current = false;
  }, [draftSessionId]);

  const realtimeBpmnOpsEnabled = resolveRealtimeBpmnOpsEnabled(enableRealtimeBpmnOps);

  const acknowledgeSessionSyncPayload = useCallback((sessionRaw) => {
    const session = ensureObject(sessionRaw);
    const sid = toText(session.id || session.session_id || draftSessionId);
    if (!sid) return;

    const sessionSyncToken = toText(buildSessionVersionToken(session));
    const remoteSyncToken = toText(session._remote_version_token);
    const sessionBpmnToken = toText(session.sync_bpmn_version_token || session.syncBpmnVersionToken);
    const sessionCollabToken = toText(session.sync_collab_version_token || session.syncCollabVersionToken);
    const acknowledgedToken = remoteSyncToken || sessionSyncToken;

    if (acknowledgedToken) {
      remoteSessionSyncAcknowledgedTokenRef.current = acknowledgedToken;
      setRemoteSessionSyncState((prev) => {
        if (prev.mode !== "stale_pending") return prev;
        const prevRemote = toText(prev.remoteToken);
        if (prevRemote && prevRemote !== acknowledgedToken) return prev;
        return {
          mode: "idle",
          remoteToken: "",
          remoteBpmnToken: "",
          remoteCollabToken: "",
          updatedAt: Number(session.updated_at || session.updatedAt || prev.updatedAt || 0) || 0,
          error: "",
        };
      });
    }

    if (sessionBpmnToken) {
      remoteSessionSyncBpmnTokenRef.current = sessionBpmnToken;
    }
    if (sessionCollabToken) {
      remoteSessionSyncCollabTokenRef.current = sessionCollabToken;
    }
  }, [draftSessionId]);

  const publishRealtimeBpmnOps = useCallback(async ({
    ops = [],
    source = "diagram",
    mutationKind = "diagram.realtime_ops",
  } = {}) => {
    if (!realtimeBpmnOpsEnabled) {
      return { ok: true, skipped: true, reason: "realtime_ops_disabled" };
    }
    const sid = toText(draftSessionId);
    if (!sid || isLocalSessionId?.(sid)) {
      return { ok: false, skipped: true, reason: "missing_or_local_session" };
    }

    const normalizedOps = ensureArray(ops)
      .map((raw) => {
        const item = ensureObject(raw);
        const kind = toText(item.kind || item.type).toLowerCase();
        const payload = ensureObject(item.payload);
        if (!kind) return null;
        return {
          kind,
          payload,
          client_ts: Number(item.client_ts || item.clientTs || item.at || Date.now()) || Date.now(),
        };
      })
      .filter(Boolean);

    if (!normalizedOps.length) {
      return { ok: true, skipped: true, reason: "empty_ops" };
    }

    const postRes = await apiPostSessionRealtimeOps?.(sid, {
      client_id: toText(realtimeBpmnOpsClientIdRef.current),
      source: toText(source) || "diagram",
      version_token: toText(liveSyncLocalVersionTokenRef.current),
      bpmn_version_token: toText(remoteSessionSyncBpmnTokenRef.current),
      collab_version_token: toText(remoteSessionSyncCollabTokenRef.current),
      ops: normalizedOps,
    });

    if (!postRes?.ok) {
      return {
        ok: false,
        error: toText(postRes?.error || "realtime_ops_post_failed"),
        status: Number(postRes?.status || 0),
      };
    }

    const lastSeq = Number(postRes?.realtime_ops?.last_seq || 0) || 0;
    if (lastSeq > Number(realtimeBpmnOpsLastSeqRef.current || 0)) {
      realtimeBpmnOpsLastSeqRef.current = lastSeq;
    }

    return {
      ok: true,
      mutation_kind: toText(mutationKind) || "diagram.realtime_ops",
      accepted: Number(postRes?.realtime_ops?.accepted || 0) || 0,
      last_seq: lastSeq,
    };
  }, [apiPostSessionRealtimeOps, draftSessionId, isLocalSessionId, realtimeBpmnOpsEnabled]);

  const applyRemoteSessionSync = useCallback(async ({
    source = "manual_apply",
    remoteToken = "",
    remoteBpmnToken = "",
    remoteCollabToken = "",
    applyScope = "full",
    forceApply = false,
  } = {}) => {
    const sid = toText(draftSessionId);
    if (!sid || isLocalSessionId?.(sid)) {
      return { ok: false, error: "missing_or_local_session" };
    }

    const normalizedRemoteToken = toText(remoteToken);
    const normalizedRemoteBpmnToken = toText(remoteBpmnToken);
    const normalizedRemoteCollabToken = toText(remoteCollabToken);
    const scope = toText(applyScope).toLowerCase() === "collab_only" ? "collab_only" : "full";
    const force = forceApply === true;

    const localToken = toText(liveSyncLocalVersionTokenRef.current);
    const acknowledgedToken = toText(remoteSessionSyncAcknowledgedTokenRef.current);
    if (!force && normalizedRemoteToken && (normalizedRemoteToken === localToken || normalizedRemoteToken === acknowledgedToken)) {
      remoteSessionSyncAcknowledgedTokenRef.current = normalizedRemoteToken;
      setRemoteSessionSyncState((prev) => ({
        ...prev,
        mode: "idle",
        remoteToken: "",
        remoteBpmnToken: "",
        remoteCollabToken: "",
        error: "",
      }));
      if (normalizedRemoteBpmnToken) remoteSessionSyncBpmnTokenRef.current = normalizedRemoteBpmnToken;
      if (normalizedRemoteCollabToken) remoteSessionSyncCollabTokenRef.current = normalizedRemoteCollabToken;
      return { ok: true, skipped: true, reason: "remote_token_already_acknowledged" };
    }

    if (remoteSessionSyncInFlightRef.current) {
      return { ok: false, error: "remote_sync_in_flight" };
    }

    remoteSessionSyncInFlightRef.current = true;
    setRemoteSessionSyncState((prev) => ({ ...prev, mode: "syncing", error: "" }));

    let loaded = null;
    let nextSession = {};
    let nextUpdatedAt = 0;
    try {
      if (scope === "collab_only") {
        loaded = await apiGetSessionCollabState?.(sid);
        if (!loaded?.ok) {
          const error = toText(loaded?.error || "remote_collab_sync_failed");
          setRemoteSessionSyncState((prev) => ({ ...prev, mode: "error", error }));
          return { ok: false, error };
        }
        const collabState = ensureObject(loaded?.collab_state);
        nextUpdatedAt = Number(collabState.updated_at || 0) || 0;
        nextSession = {
          id: sid,
          session_id: sid,
          notes_by_element: ensureObject(collabState.notes_by_element),
          bpmn_meta: {
            ...normalizeBpmnMeta?.(draftBpmnMeta),
            review_v1: ensureObject(collabState.review_v1),
          },
          updated_at: nextUpdatedAt,
          sync_version_token: toText(collabState.version_token || normalizedRemoteToken),
          sync_bpmn_version_token: toText(collabState.bpmn_version_token || normalizedRemoteBpmnToken),
          sync_collab_version_token: toText(collabState.collab_version_token || normalizedRemoteCollabToken),
        };
      } else {
        loaded = await apiGetSession?.(sid);
        if (!loaded?.ok) {
          const error = toText(loaded?.error || "remote_session_sync_failed");
          setRemoteSessionSyncState((prev) => ({ ...prev, mode: "error", error }));
          return { ok: false, error };
        }
        nextSession = loaded?.session && typeof loaded.session === "object" ? loaded.session : {};
        nextUpdatedAt = Number(nextSession.updated_at || 0) || 0;
      }
    } finally {
      remoteSessionSyncInFlightRef.current = false;
    }

    const nextSessionToken = toText(buildSessionVersionToken(nextSession));
    const currentLocalToken = toText(liveSyncLocalVersionTokenRef.current);
    if (!force && nextSessionToken && nextSessionToken === currentLocalToken) {
      remoteSessionSyncAcknowledgedTokenRef.current = nextSessionToken;
      setRemoteSessionSyncState((prev) => ({
        ...prev,
        mode: "idle",
        remoteToken: "",
        remoteBpmnToken: "",
        remoteCollabToken: "",
        updatedAt: Number(nextUpdatedAt || prev.updatedAt || 0) || 0,
        error: "",
      }));
      return { ok: true, skipped: true, reason: "remote_sync_noop_equivalent" };
    }

    const nextBpmnToken = toText(nextSession?.sync_bpmn_version_token);
    const nextCollabToken = toText(nextSession?.sync_collab_version_token);
    onSessionSyncRef.current?.({
      ...nextSession,
      _sync_source: `remote_session_sync_${toText(source) || "apply"}_${scope}`,
      _remote_version_token: normalizedRemoteToken,
      _remote_force_bpmn_apply_token: force && scope !== "collab_only" ? normalizedRemoteToken : "",
    });

    const acknowledgedNextToken = toText(nextSessionToken || normalizedRemoteToken);
    if (acknowledgedNextToken) {
      remoteSessionSyncAcknowledgedTokenRef.current = acknowledgedNextToken;
    }
    if (nextBpmnToken || normalizedRemoteBpmnToken) {
      remoteSessionSyncBpmnTokenRef.current = toText(nextBpmnToken || normalizedRemoteBpmnToken);
    }
    if (nextCollabToken || normalizedRemoteCollabToken) {
      remoteSessionSyncCollabTokenRef.current = toText(nextCollabToken || normalizedRemoteCollabToken);
    }

    setRemoteSessionSyncState({
      mode: "idle",
      remoteToken: "",
      remoteBpmnToken: "",
      remoteCollabToken: "",
      updatedAt: Number(nextUpdatedAt || Date.now()) || 0,
      error: "",
    });

    if (scope === "full") {
      realtimeBpmnOpsGapDetectedRef.current = false;
    }

    return {
      ok: true,
      scope,
      updatedAt: Number(nextUpdatedAt || 0),
    };
  }, [
    apiGetSession,
    apiGetSessionCollabState,
    draftBpmnMeta,
    draftSessionId,
    isLocalSessionId,
    normalizeBpmnMeta,
  ]);

  const applyRemoteSessionSyncRef = useRef(applyRemoteSessionSync);
  useEffect(() => {
    applyRemoteSessionSyncRef.current = applyRemoteSessionSync;
  }, [applyRemoteSessionSync]);

  const applyPendingRemoteSessionSync = useCallback(async () => {
    const isStalePending = toText(remoteSessionSyncState?.mode).toLowerCase() === "stale_pending";
    const remoteBpmnToken = toText(remoteSessionSyncState?.remoteBpmnToken);
    const remoteCollabToken = toText(remoteSessionSyncState?.remoteCollabToken);
    const localBpmnToken = toText(remoteSessionSyncBpmnTokenRef.current);
    const localCollabToken = toText(remoteSessionSyncCollabTokenRef.current);

    const applyScope = isStalePending
      ? "full"
      : decideRemoteSessionApplyScope({
        localBpmnVersionToken: localBpmnToken,
        localCollabVersionToken: localCollabToken,
        remoteBpmnVersionToken: remoteBpmnToken,
        remoteCollabVersionToken: remoteCollabToken,
      });

    return applyRemoteSessionSync({
      source: "manual_apply",
      remoteToken: toText(remoteSessionSyncState?.remoteToken),
      remoteBpmnToken,
      remoteCollabToken,
      applyScope,
      forceApply: isStalePending,
    });
  }, [
    applyRemoteSessionSync,
    remoteSessionSyncState?.mode,
    remoteSessionSyncState?.remoteBpmnToken,
    remoteSessionSyncState?.remoteCollabToken,
    remoteSessionSyncState?.remoteToken,
  ]);

  useEffect(() => {
    const sid = toText(draftSessionId);
    if (!realtimeBpmnOpsEnabled || !sid || isLocalSessionId?.(sid)) {
      realtimeBpmnOpsLastSeqRef.current = 0;
      realtimeBpmnOpsGapDetectedRef.current = false;
      return () => {};
    }

    realtimeBpmnOpsPollSeqRef.current += 1;
    const scopeSeq = realtimeBpmnOpsPollSeqRef.current;
    let isDisposed = false;
    let timerId = 0;

    async function tick() {
      const afterSeq = Number(realtimeBpmnOpsLastSeqRef.current || 0);
      const response = await apiGetSessionRealtimeOps?.(sid, { afterSeq, limit: 180 });
      if (isDisposed || scopeSeq !== realtimeBpmnOpsPollSeqRef.current) return;

      if (response?.ok) {
        const payload = ensureObject(response?.realtime_ops);
        const items = ensureArray(payload.items)
          .map((row) => ensureObject(row))
          .filter((row) => Number(row.seq || 0) > 0)
          .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));

        const firstSeq = Number(items[0]?.seq || 0) || 0;
        const lastSeqFromPayload = Number(payload.last_seq || 0) || 0;
        if (firstSeq > 0 && firstSeq > afterSeq + 1) {
          realtimeBpmnOpsGapDetectedRef.current = true;
        }

        const localClientId = toText(realtimeBpmnOpsClientIdRef.current);
        const foreignItems = items.filter((row) => toText(row.client_id) !== localClientId);
        if (foreignItems.length > 0) {
          const seqFrom = Number(foreignItems[0]?.seq || 0) || 0;
          const seqTo = Number(foreignItems[foreignItems.length - 1]?.seq || 0) || 0;
          const latestRow = ensureObject(foreignItems[foreignItems.length - 1]);
          onSessionSyncRef.current?.({
            id: sid,
            session_id: sid,
            _sync_source: "realtime_bpmn_ops_stream",
            _remote_realtime_ops: {
              session_id: sid,
              seq_from: seqFrom,
              seq_to: seqTo,
              items: foreignItems,
              remote_token: toText(latestRow.version_token),
              remote_bpmn_token: toText(latestRow.bpmn_version_token),
              remote_collab_token: toText(latestRow.collab_version_token),
              received_at: Date.now(),
            },
          });
          const latestBpmnToken = toText(latestRow.bpmn_version_token);
          const latestCollabToken = toText(latestRow.collab_version_token);
          if (latestBpmnToken) remoteSessionSyncBpmnTokenRef.current = latestBpmnToken;
          if (latestCollabToken) remoteSessionSyncCollabTokenRef.current = latestCollabToken;
        }

        const nextLastSeq = Math.max(
          Number(realtimeBpmnOpsLastSeqRef.current || 0),
          Number(lastSeqFromPayload || 0),
          Number(items[items.length - 1]?.seq || 0),
        );
        if (nextLastSeq > Number(realtimeBpmnOpsLastSeqRef.current || 0)) {
          realtimeBpmnOpsLastSeqRef.current = nextLastSeq;
        }
      }

      if (isDisposed || scopeSeq !== realtimeBpmnOpsPollSeqRef.current) return;
      timerId = window.setTimeout(() => {
        void tick();
      }, REALTIME_BPMN_OPS_POLL_MS);
    }

    void tick();
    return () => {
      isDisposed = true;
      realtimeBpmnOpsPollSeqRef.current += 1;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [apiGetSessionRealtimeOps, draftSessionId, isLocalSessionId, realtimeBpmnOpsEnabled]);

  useEffect(() => {
    const sid = toText(draftSessionId);
    if (!sid || isLocalSessionId?.(sid)) {
      setRemoteSessionSyncState({
        mode: "idle",
        remoteToken: "",
        remoteBpmnToken: "",
        remoteCollabToken: "",
        updatedAt: 0,
        error: "",
      });
      remoteSessionSyncAcknowledgedTokenRef.current = "";
      remoteSessionSyncBpmnTokenRef.current = "";
      remoteSessionSyncCollabTokenRef.current = "";
      return () => {};
    }

    remoteSessionSyncSeqRef.current += 1;
    const scopeSeq = remoteSessionSyncSeqRef.current;
    let isDisposed = false;
    let timerId = 0;

    async function tick() {
      const response = await apiGetSessionSyncState?.(sid);
      if (isDisposed || scopeSeq !== remoteSessionSyncSeqRef.current) return;

      if (!response?.ok) {
        setRemoteSessionSyncState((prev) => {
          if (prev.mode === "stale_pending") return prev;
          return {
            ...prev,
            mode: "error",
            error: toText(response?.error || "remote_sync_state_failed"),
          };
        });
      } else {
        const syncState = ensureObject(response?.sync_state);
        const remoteToken = toText(syncState.version_token);
        const remoteBpmnToken = toText(syncState.bpmn_version_token);
        const remoteCollabToken = toText(syncState.collab_version_token);
        const remoteRealtimeOpsSeq = Number(syncState.realtime_ops_seq || 0) || 0;

        const localBpmnToken = toText(remoteSessionSyncBpmnTokenRef.current);
        const localCollabToken = toText(remoteSessionSyncCollabTokenRef.current);

        let action = decideRemoteSessionSyncAction({
          localVersionToken: liveSyncLocalVersionTokenRef.current,
          remoteVersionToken: remoteToken,
          acknowledgedRemoteVersionToken: remoteSessionSyncAcknowledgedTokenRef.current,
          unsafeLocal: hasUnsafeLocalSyncStateRef.current === true,
        });

        // Rollback legacy save ACK can expose version-token formatting drift
        // even when BPMN/Collab slices are already aligned locally. In that case
        // skip remote apply/stale transitions and acknowledge remote token.
        if (action !== "noop" && remoteToken) {
          const bpmnSliceMatch = !!remoteBpmnToken && !!localBpmnToken && remoteBpmnToken === localBpmnToken;
          const collabSliceKnown = !!remoteCollabToken && !!localCollabToken;
          const collabSliceMatch = collabSliceKnown && remoteCollabToken === localCollabToken;
          const slicesEquivalent = bpmnSliceMatch && (!collabSliceKnown || collabSliceMatch);
          if (slicesEquivalent) {
            action = "noop";
          }
        }

        if (shouldLogBpmnTrace()) {
          // eslint-disable-next-line no-console
          console.debug(
            `[REMOTE_SYNC] poll sid=${sid} action=${action} unsafe=${hasUnsafeLocalSyncStateRef.current ? 1 : 0} `
            + `local=${toText(liveSyncLocalVersionTokenRef.current) || "-"} `
            + `ack=${toText(remoteSessionSyncAcknowledgedTokenRef.current) || "-"} `
            + `remote=${remoteToken || "-"} `
            + `local_bpmn=${localBpmnToken || "-"} remote_bpmn=${remoteBpmnToken || "-"} `
            + `local_collab=${localCollabToken || "-"} remote_collab=${remoteCollabToken || "-"}`,
          );
        }

        if (action === "noop") {
          if (remoteToken) remoteSessionSyncAcknowledgedTokenRef.current = remoteToken;
          if (remoteBpmnToken) remoteSessionSyncBpmnTokenRef.current = remoteBpmnToken;
          if (remoteCollabToken) remoteSessionSyncCollabTokenRef.current = remoteCollabToken;
          setRemoteSessionSyncState((prev) => {
            if (prev.mode === "idle" && !prev.error && !prev.remoteToken) return prev;
            return {
              mode: "idle",
              remoteToken: "",
              remoteBpmnToken: "",
              remoteCollabToken: "",
              updatedAt: Number(syncState.updated_at || prev.updatedAt || 0) || 0,
              error: "",
            };
          });
        } else if (action === "mark_stale") {
          setRemoteSessionSyncState({
            mode: "stale_pending",
            remoteToken,
            remoteBpmnToken,
            remoteCollabToken,
            updatedAt: Number(syncState.updated_at || 0) || 0,
            error: "",
          });
        } else if (action === "auto_apply" && !remoteSessionSyncInFlightRef.current) {
          const applyScope = decideRemoteSessionApplyScope({
            localBpmnVersionToken: localBpmnToken,
            localCollabVersionToken: localCollabToken,
            remoteBpmnVersionToken: remoteBpmnToken,
            remoteCollabVersionToken: remoteCollabToken,
          });
          const hasOpsGap = realtimeBpmnOpsGapDetectedRef.current === true;
          const consumedOpsSeq = Number(realtimeBpmnOpsLastSeqRef.current || 0) || 0;
          const alreadyCoveredByRealtimeOps = !hasOpsGap
            && remoteRealtimeOpsSeq > 0
            && remoteRealtimeOpsSeq <= consumedOpsSeq;

          if (alreadyCoveredByRealtimeOps) {
            if (remoteToken) remoteSessionSyncAcknowledgedTokenRef.current = remoteToken;
            if (remoteBpmnToken) remoteSessionSyncBpmnTokenRef.current = remoteBpmnToken;
            if (remoteCollabToken) remoteSessionSyncCollabTokenRef.current = remoteCollabToken;
            setRemoteSessionSyncState((prev) => ({
              mode: "idle",
              remoteToken: "",
              remoteBpmnToken: "",
              remoteCollabToken: "",
              updatedAt: Number(syncState.updated_at || prev.updatedAt || 0) || 0,
              error: "",
            }));
          } else {
            await applyRemoteSessionSyncRef.current?.({
              source: "poll_auto",
              remoteToken,
              remoteBpmnToken,
              remoteCollabToken,
              applyScope,
            });
          }
        }
      }

      if (isDisposed || scopeSeq !== remoteSessionSyncSeqRef.current) return;
      timerId = window.setTimeout(() => {
        void tick();
      }, LIVE_SESSION_SYNC_POLL_MS);
    }

    void tick();
    return () => {
      isDisposed = true;
      remoteSessionSyncSeqRef.current += 1;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [
    apiGetSessionSyncState,
    draftSessionId,
    isLocalSessionId,
  ]);

  return {
    remoteSessionSyncState,
    publishRealtimeBpmnOps,
    applyPendingRemoteSessionSync,
    acknowledgeSessionSyncPayload,
  };
}
