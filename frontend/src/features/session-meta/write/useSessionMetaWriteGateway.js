import { useCallback, useRef } from "react";

import { apiPatchSession } from "../../../lib/api/sessionApi";
import { buildSessionMetaWriteEnvelope } from "./sessionMetaMergePolicy";

function toText(value) {
  return String(value || "").trim();
}

export default function useSessionMetaWriteGateway({
  sid,
  isLocal,
  normalizeMeta,
  serializeMeta,
  getPersistedMeta,
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
    const runWrite = async () => {
      const syncRes = await apiPatchSession(sid, { bpmn_meta: nextMeta });
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
      }
      return {
        ok: true,
        writeSeq,
        session: syncRes.session && typeof syncRes.session === "object" ? syncRes.session : null,
      };
    };

    pendingWriteRef.current = pendingWriteRef.current
      .catch(() => ({ ok: false }))
      .then(runWrite);
    return pendingWriteRef.current;
  }, [
    getPersistedMeta,
    isLocal,
    normalizeMeta,
    onSessionSync,
    serializeMeta,
    setGenErr,
    shortErr,
    sid,
  ]);

  return {
    persistSessionMeta,
  };
}
