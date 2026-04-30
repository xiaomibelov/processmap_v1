import { useCallback, useRef } from "react";

import { apiPatchSession } from "../../../lib/api/sessionApi";
import { buildSessionMetaWriteEnvelope } from "./sessionMetaMergePolicy";
import { enqueueSessionPatchCasWrite } from "../../process/stage/utils/sessionPatchCasCoordinator";

function toText(value) {
  return String(value || "").trim();
}

export default function useSessionMetaWriteGateway({
  sid,
  isLocal,
  normalizeMeta,
  serializeMeta,
  getPersistedMeta,
  getBaseDiagramStateVersion,
  rememberDiagramStateVersion,
  onSessionSync,
  shortErr,
  setGenErr,
}) {
  const writeSeqRef = useRef(0);
  const pendingWriteRef = useRef(Promise.resolve({ ok: true }));

  const persistSessionMeta = useCallback(async (nextMetaRaw, options = {}) => {
    const source = toText(options?.source) || "session_meta_write";
    const nextMeta = normalizeMeta(nextMetaRaw);
    const prevMeta = normalizeMeta(
      typeof options?.prevMetaFactory === "function"
        ? options.prevMetaFactory()
        : getPersistedMeta?.(),
    );
    if (serializeMeta(nextMeta) === serializeMeta(prevMeta)) {
      return { ok: true, skipped: true, source };
    }
    writeSeqRef.current += 1;
    const writeSeq = Number(writeSeqRef.current);
    if (typeof options?.onOptimistic === "function") {
      options.onOptimistic({ nextMeta, prevMeta, writeSeq, source });
    }
    onSessionSync?.(buildSessionMetaWriteEnvelope({
      sessionId: sid,
      bpmnMeta: nextMeta,
      source,
      writeSeq,
    }));
    if (!sid || isLocal) {
      return { ok: true, local: true, writeSeq };
    }
    const resolveBaseDiagramStateVersion = () => {
      const fromOptionRaw = Number(options?.baseDiagramStateVersion);
      const fromOptionNormalized = Number.isFinite(fromOptionRaw) && fromOptionRaw >= 0
        ? Math.round(fromOptionRaw)
        : null;
      const fromGatewayRaw = Number(
        typeof getBaseDiagramStateVersion === "function"
          ? getBaseDiagramStateVersion()
          : NaN,
      );
      const fromGatewayNormalized = Number.isFinite(fromGatewayRaw) && fromGatewayRaw >= 0
        ? Math.round(fromGatewayRaw)
        : null;
      if (fromOptionNormalized !== null && fromGatewayNormalized !== null) {
        if (fromOptionNormalized <= 0 && fromGatewayNormalized > 0) return fromGatewayNormalized;
        if (fromGatewayNormalized <= 0 && fromOptionNormalized > 0) return fromOptionNormalized;
        return Math.max(fromOptionNormalized, fromGatewayNormalized);
      }
      if (fromOptionNormalized !== null) return fromOptionNormalized;
      if (fromGatewayNormalized !== null) return fromGatewayNormalized;
      return null;
    };
    const remoteWrite = typeof options?.remoteWrite === "function"
      ? options.remoteWrite
      : async ({ sid: writeSid, nextMeta: writeMeta, baseDiagramStateVersion: baseVersion }) => {
        const payload = { bpmn_meta: writeMeta };
        if (Number.isFinite(baseVersion) && baseVersion >= 0) {
          payload.base_diagram_state_version = Math.round(baseVersion);
        }
        return enqueueSessionPatchCasWrite({
          sessionId: writeSid,
          patch: payload,
          apiPatchSession,
          getBaseDiagramStateVersion,
          rememberDiagramStateVersion,
        });
      };
    const runWrite = async () => {
      const baseDiagramStateVersion = resolveBaseDiagramStateVersion();
      const syncRes = await remoteWrite({
        sid,
        nextMeta,
        prevMeta,
        writeSeq,
        source,
        baseDiagramStateVersion,
      });
      if (writeSeq !== writeSeqRef.current) {
        return { ok: true, stale: true, dropped: true, writeSeq };
      }
      if (!syncRes?.ok) {
        if (typeof options?.onRollback === "function") {
          options.onRollback({ nextMeta, prevMeta, writeSeq, source, syncRes });
        }
        const msg = shortErr(syncRes?.error || "Не удалось сохранить session meta.");
        setGenErr?.(msg);
        return { ok: false, error: msg, status: Number(syncRes?.status || 0), writeSeq };
      }
      if (syncRes.session && typeof syncRes.session === "object") {
        onSessionSync?.({
          ...syncRes.session,
          _sync_source: `${source}_session_patch`,
          _meta_write_seq: writeSeq,
        });
      } else if (syncRes.meta && typeof syncRes.meta === "object") {
        onSessionSync?.(buildSessionMetaWriteEnvelope({
          sessionId: sid,
          bpmnMeta: syncRes.meta,
          source: `${source}_meta_patch`,
          writeSeq,
        }));
      }
      return {
        ok: true,
        writeSeq,
        session: syncRes.session && typeof syncRes.session === "object" ? syncRes.session : null,
        meta: syncRes.meta && typeof syncRes.meta === "object" ? syncRes.meta : null,
      };
    };

    pendingWriteRef.current = pendingWriteRef.current
      .catch(() => ({ ok: false }))
      .then(runWrite);
    return pendingWriteRef.current;
  }, [
    getBaseDiagramStateVersion,
    getPersistedMeta,
    isLocal,
    normalizeMeta,
    onSessionSync,
    rememberDiagramStateVersion,
    serializeMeta,
    setGenErr,
    shortErr,
    sid,
  ]);

  return {
    persistSessionMeta,
  };
}
