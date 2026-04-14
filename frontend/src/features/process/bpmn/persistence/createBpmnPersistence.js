function asText(value) {
  return String(value || "");
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function tryParseObjectJson(raw) {
  const text = asText(raw).trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return asObject(parsed);
  } catch {
    return {};
  }
}

function resolvePersistErrorDetails(saved = null) {
  const value = asObject(saved);
  const data = asObject(value.data);
  const direct = asObject(value.errorDetails || value.error_details);
  if (Object.keys(direct).length) return direct;
  const detailObject = asObject(data.detail);
  if (Object.keys(detailObject).length) return detailObject;
  const parsedDetail = tryParseObjectJson(data.detail);
  if (Object.keys(parsedDetail).length) return parsedDetail;
  const parsedError = tryParseObjectJson(value.error);
  if (Object.keys(parsedError).length) return parsedError;
  if (typeof data.code === "string" && data.code.trim()) return data;
  return {};
}

function resolvePersistErrorText(saved = null, fallback = "", details = {}, status = 0) {
  const value = asObject(saved);
  const data = asObject(value.data);
  const directText = asText(value.error || data.error || data.message || "");
  if (directText && directText !== "[object Object]") return directText;
  const detailMessage = asText(
    details.message
    || details.detail
    || details.reason
    || details.error,
  );
  if (detailMessage && detailMessage !== "[object Object]") return detailMessage;
  const code = asText(details.code || data.code).toUpperCase();
  if (code === "DIAGRAM_STATE_CONFLICT") {
    return "Конфликт версии BPMN. Обновите сессию и повторите сохранение.";
  }
  if (code === "DIAGRAM_STATE_BASE_VERSION_REQUIRED") {
    return "Сохранение отклонено: отсутствует базовая версия диаграммы.";
  }
  if (Number(status || 0) === 409) {
    return "Конфликт версии BPMN. Обновите сессию и повторите сохранение.";
  }
  return asText(fallback || "failed to save bpmn");
}

function fnv1aHex(input) {
  const src = asText(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const RUNTIME_CACHE_PREFIX = "fpc_bpmn_runtime_cache:";
const RUNTIME_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24;

function runtimeCacheKey(sessionId) {
  const sid = asText(sessionId).trim();
  if (!sid) return "";
  return `${RUNTIME_CACHE_PREFIX}${sid}`;
}

function readRuntimeCache(sessionId) {
  if (typeof window === "undefined") return null;
  const key = runtimeCacheKey(sessionId);
  if (!key) return null;
  try {
    const raw = String(window.localStorage?.getItem(key) || "");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const xml = asText(parsed?.xml || "");
    const ts = asNumber(parsed?.ts, 0);
    if (!xml.trim()) return null;
    if (ts > 0 && (Date.now() - ts) > RUNTIME_CACHE_MAX_AGE_MS) return null;
    return {
      source: "runtime_cache",
      xml,
      rev: asNumber(parsed?.rev, 0),
      ts,
      hash: asText(parsed?.hash || fnv1aHex(xml)),
      reason: asText(parsed?.reason || "runtime_change"),
    };
  } catch {
    return null;
  }
}

function writeRuntimeCache(sessionId, xmlText, rev = 0, reason = "runtime_change") {
  if (typeof window === "undefined") return null;
  const sid = asText(sessionId).trim();
  const key = runtimeCacheKey(sid);
  const xml = asText(xmlText);
  if (!sid || !key || !xml.trim()) return null;
  const payload = {
    xml,
    rev: asNumber(rev, 0),
    ts: Date.now(),
    hash: fnv1aHex(xml),
    reason: asText(reason || "runtime_change"),
  };
  try {
    window.localStorage?.setItem(key, JSON.stringify(payload));
    return {
      source: "runtime_cache",
      xml: payload.xml,
      rev: payload.rev,
      ts: payload.ts,
      hash: payload.hash,
      reason: payload.reason,
    };
  } catch {
    return null;
  }
}

function pickFreshestCandidate(candidates = []) {
  const list = (Array.isArray(candidates) ? candidates : [])
    .filter((item) => asText(item?.xml).trim())
    .map((item) => ({
      source: asText(item?.source || "unknown"),
      xml: asText(item?.xml),
      rev: asNumber(item?.rev, 0),
      ts: asNumber(item?.ts, 0),
      hash: asText(item?.hash || fnv1aHex(item?.xml || "")),
      reason: asText(item?.reason || ""),
    }));
  if (!list.length) return null;
  list.sort((a, b) => {
    if (a.rev !== b.rev) return b.rev - a.rev;
    if (a.ts !== b.ts) return b.ts - a.ts;
    if (a.xml.length !== b.xml.length) return b.xml.length - a.xml.length;
    return String(a.hash).localeCompare(String(b.hash));
  });
  return list[0];
}

function snapshotStorageKey(projectId, sessionId) {
  const pid = asText(projectId).trim() || "no_project";
  const sid = asText(sessionId).trim();
  if (!sid) return "";
  return `snapshots:${pid}:${sid}`;
}

function snapshotMode(reason) {
  const raw = asText(reason).trim().toLowerCase();
  if (raw.includes("manual")) return "manual";
  return "auto";
}

export default function createBpmnPersistence(options = {}) {
  const getSessionDraft = typeof options?.getSessionDraft === "function"
    ? options.getSessionDraft
    : () => ({});
  const getLocalStorageKey = typeof options?.getLocalStorageKey === "function"
    ? options.getLocalStorageKey
    : (sid) => `fpc_bpmn_xml_${sid}`;
  const isLocalSessionId = typeof options?.isLocalSessionId === "function"
    ? options.isLocalSessionId
    : () => false;
  const apiGetBpmnXml = typeof options?.apiGetBpmnXml === "function"
    ? options.apiGetBpmnXml
    : null;
  const apiPutBpmnXml = typeof options?.apiPutBpmnXml === "function"
    ? options.apiPutBpmnXml
    : null;
  const saveSnapshot = typeof options?.saveSnapshot === "function"
    ? options.saveSnapshot
    : null;
  const loadLatestSnapshot = typeof options?.loadLatestSnapshot === "function"
    ? options.loadLatestSnapshot
    : null;
  const getSnapshotProjectId = typeof options?.getSnapshotProjectId === "function"
    ? options.getSnapshotProjectId
    : null;
  const onTrace = typeof options?.onTrace === "function"
    ? options.onTrace
    : null;

  function emit(event, payload = {}) {
    if (!onTrace) return;
    try {
      onTrace(String(event || "unknown"), payload);
    } catch {
      // no-op
    }
  }

  function draftRevision() {
    const draft = getSessionDraft?.() || {};
    const byBpmnVersion = asNumber(draft?.bpmn_xml_version, 0);
    const bySessionVersion = asNumber(draft?.version, 0);
    return byBpmnVersion || bySessionVersion || 0;
  }

  function snapshotProjectId() {
    if (typeof getSnapshotProjectId === "function") {
      return asText(getSnapshotProjectId()).trim();
    }
    const draft = getSessionDraft?.() || {};
    return asText(draft?.project_id || draft?.projectId || "").trim();
  }

  async function maybeSaveSnapshot(sessionId, xmlText, reason, rev, force = false) {
    if (typeof saveSnapshot !== "function") return { ok: false, reason: "read_fail" };
    const sid = asText(sessionId).trim();
    const xml = asText(xmlText);
    const projectId = snapshotProjectId();
    const key = snapshotStorageKey(projectId, sid);
    const hash = fnv1aHex(xml);
    const len = xml.length;
    const snapshotRev = asNumber(rev, 0);
    const mode = snapshotMode(reason);
    // eslint-disable-next-line no-console
    console.debug(
      `SNAPSHOT_TRY sid=${sid || "-"} rev=${snapshotRev} hash=${hash} len=${len} `
      + `mode=${mode} force=${force ? 1 : 0} key="${key}"`,
    );
    if (!sid || !xml.trim() || !key) {
      // eslint-disable-next-line no-console
      console.debug(
        `SNAPSHOT_DECISION sid=${sid || "-"} rev=${snapshotRev} hash=${hash} len=${len} existingCount=0 `
        + `lastSnapshotId=- lastHash=- reason=wrong_key key="${key}"`,
      );
      return { ok: false, reason: "wrong_key" };
    }
    try {
      const decision = await saveSnapshot({
        projectId,
        sessionId: sid,
        xml,
        reason,
        rev: snapshotRev,
        force: force === true,
      });
      const decisionReason = asText(
        decision?.decisionReason
          || (decision?.saved ? "saved_new" : "")
          || (decision?.deduped ? "skip_same_hash" : "")
          || (decision?.ok ? "saved_new" : "read_fail"),
      );
      const existingCount = asNumber(decision?.existingCount, 0);
      const lastSnapshotId = asText(decision?.lastSnapshotId || "-");
      const lastHash = asText(decision?.lastHash || "-");
      // eslint-disable-next-line no-console
      console.debug(
        `SNAPSHOT_DECISION sid=${sid} rev=${snapshotRev} hash=${hash} len=${len} existingCount=${existingCount} `
        + `lastSnapshotId=${lastSnapshotId || "-"} lastHash=${lastHash || "-"} reason=${decisionReason || "read_fail"} key="${key}"`,
      );
      return { ok: !!decision?.ok, reason: decisionReason || "read_fail", decision };
    } catch {
      // eslint-disable-next-line no-console
      console.debug(
        `SNAPSHOT_DECISION sid=${sid} rev=${snapshotRev} hash=${hash} len=${len} existingCount=0 `
        + `lastSnapshotId=- lastHash=- reason=read_fail key="${key}"`,
      );
      return { ok: false, reason: "read_fail" };
    }
  }

  async function loadRaw(sessionId, optionsForLoad = {}) {
    const sid = asText(sessionId).trim();
    if (!sid) return { ok: false, status: 0, error: "missing session id" };
    const forceRemote = optionsForLoad?.forceRemote === true;
    const preferLocalCandidate = optionsForLoad?.preferLocalCandidate === true;

    if (isLocalSessionId(sid)) {
      const xml = asText(window.localStorage?.getItem(getLocalStorageKey(sid)) || "");
      return {
        ok: true,
        status: 200,
        source: "local",
        xml,
        rev: asNumber(optionsForLoad?.rev, 0),
        hash: fnv1aHex(xml),
        sourceReason: "local_session_authoritative",
      };
    }

    const draft = getSessionDraft?.() || {};
    const draftXml = asText(draft?.bpmn_xml || "");
    const rev = draftRevision();
    const runtimeCache = forceRemote ? null : readRuntimeCache(sid);
    const draftCandidate = (!forceRemote && draftXml.trim())
      ? {
          source: "draft",
          xml: draftXml,
          rev,
          hash: fnv1aHex(draftXml),
          ts: 0,
        }
      : null;
    const localWinner = forceRemote ? null : pickFreshestCandidate([draftCandidate, runtimeCache]);

    if (typeof apiGetBpmnXml !== "function") {
      if (localWinner) {
        emit("PERSISTENCE_LOAD_LOCAL_WINNER_NO_REMOTE_API", {
          sid,
          source: localWinner.source,
          rev: localWinner.rev,
          hash: localWinner.hash,
        });
        return {
          ok: true,
          status: 200,
          source: localWinner.source,
          xml: localWinner.xml,
          rev: localWinner.rev,
          hash: localWinner.hash,
          sourceReason: "local_no_remote_api",
        };
      }
      if (typeof loadLatestSnapshot === "function") {
        try {
          const snap = await loadLatestSnapshot({
            projectId: snapshotProjectId(),
            sessionId: sid,
          });
          const snapXml = asText(snap?.xml || "");
          if (snapXml.trim()) {
            emit("PERSISTENCE_LOAD_SNAPSHOT_FALLBACK", {
              sid,
              rev: asNumber(snap?.rev, 0),
              hash: asText(snap?.hash || fnv1aHex(snapXml)),
            });
            return {
              ok: true,
              status: 200,
              source: "snapshot",
              xml: snapXml,
              rev: asNumber(snap?.rev, rev),
              hash: asText(snap?.hash || fnv1aHex(snapXml)),
              sourceReason: "snapshot_fallback_no_remote_api",
            };
          }
        } catch {
        }
      }
      if (runtimeCache?.xml?.trim()) {
        emit("PERSISTENCE_LOAD_RUNTIME_ONLY", {
          sid,
          rev: runtimeCache.rev,
          hash: runtimeCache.hash,
        });
        return {
          ok: true,
          status: 200,
          source: runtimeCache.source,
          xml: runtimeCache.xml,
          rev: runtimeCache.rev,
          hash: runtimeCache.hash,
          sourceReason: "runtime_cache_fallback_no_remote_api",
        };
      }
      return { ok: false, status: 0, error: "apiGetBpmnXml unavailable" };
    }
    const loaded = await apiGetBpmnXml(sid, {
      raw: true,
      includeOverlay: false,
      cacheBust: true,
    });
    if (!loaded?.ok) {
      return {
        ok: false,
        status: asNumber(loaded?.status, 0),
        error: asText(loaded?.error || "failed to load bpmn"),
      };
    }
    const xml = asText(loaded?.xml || "");
    const backendCandidate = {
      source: "backend",
      xml,
      rev,
      hash: fnv1aHex(xml),
      ts: 0,
    };
    let snapshotCandidate = null;
    if (!xml.trim() && typeof loadLatestSnapshot === "function") {
      try {
        const snap = await loadLatestSnapshot({
          projectId: snapshotProjectId(),
          sessionId: sid,
        });
        const snapXml = asText(snap?.xml || "");
        if (snapXml.trim()) {
          snapshotCandidate = {
            source: "snapshot",
            xml: snapXml,
            rev: asNumber(snap?.rev, rev),
            hash: asText(snap?.hash || fnv1aHex(snapXml)),
            ts: asNumber(snap?.ts, 0),
          };
        }
      } catch {
      }
    }
    const backendHasXml = !!xml.trim();
    if (backendHasXml) {
      if (
        preferLocalCandidate
        && localWinner
        && localWinner.hash
        && localWinner.hash !== backendCandidate.hash
      ) {
        emit("PERSISTENCE_LOAD_LOCAL_OVERRIDE_EXPLICIT", {
          sid,
          local_source: localWinner.source,
          local_rev: localWinner.rev,
          local_hash: localWinner.hash,
          backend_hash: backendCandidate.hash,
        });
        return {
          ok: true,
          status: asNumber(loaded?.status, 200),
          source: localWinner.source,
          xml: localWinner.xml,
          rev: localWinner.rev,
          hash: localWinner.hash,
          sourceReason: "explicit_local_override",
        };
      }
      if (localWinner && localWinner.hash && localWinner.hash !== backendCandidate.hash) {
        emit("PERSISTENCE_LOAD_LOCAL_REJECTED_REMOTE_AUTHORITATIVE", {
          sid,
          local_source: localWinner.source,
          local_rev: localWinner.rev,
          local_hash: localWinner.hash,
          backend_hash: backendCandidate.hash,
        });
      }
      return {
        ok: true,
        status: asNumber(loaded?.status, 200),
        source: "backend",
        xml: backendCandidate.xml,
        rev: backendCandidate.rev,
        hash: backendCandidate.hash,
        sourceReason: "remote_authoritative_after_remote_read",
      };
    }

    const fallbackWinner = pickFreshestCandidate([localWinner, snapshotCandidate, runtimeCache]);
    if (fallbackWinner?.source === "runtime_cache") {
      emit("PERSISTENCE_LOAD_RUNTIME_RECOVER", {
        sid,
        rev: fallbackWinner.rev,
        hash: fallbackWinner.hash,
      });
    } else if (fallbackWinner?.source === "snapshot") {
      emit("PERSISTENCE_LOAD_SNAPSHOT_RECOVER", {
        sid,
        rev: fallbackWinner.rev,
        hash: fallbackWinner.hash,
      });
    } else if (fallbackWinner?.source === "draft") {
      emit("PERSISTENCE_LOAD_DRAFT_RECOVER", {
        sid,
        rev: fallbackWinner.rev,
        hash: fallbackWinner.hash,
      });
    }
    if (fallbackWinner) {
      return {
        ok: true,
        status: asNumber(loaded?.status, 200),
        source: fallbackWinner.source,
        xml: fallbackWinner.xml,
        rev: fallbackWinner.rev,
        hash: fallbackWinner.hash,
        sourceReason: "backend_empty_local_fallback",
      };
    }
    return {
      ok: true,
      status: asNumber(loaded?.status, 200),
      source: "backend",
      xml,
      rev,
      hash: fnv1aHex(xml),
      sourceReason: "remote_empty_no_local_fallback",
    };
  }

  async function saveRaw(sessionId, xmlText, rev, reason = "save") {
    const sid = asText(sessionId).trim();
    if (!sid) return { ok: false, status: 0, error: "missing session id" };
    const xml = asText(xmlText);
    const targetRev = asNumber(rev, 0);

    if (isLocalSessionId(sid)) {
      window.localStorage?.setItem(getLocalStorageKey(sid), xml);
      await maybeSaveSnapshot(sid, xml, reason, targetRev, false);
      return {
        ok: true,
        status: 200,
        source: "local",
        storedRev: targetRev,
        rev: targetRev,
        hash: fnv1aHex(xml),
      };
    }

    if (typeof apiPutBpmnXml !== "function") {
      return { ok: false, status: 0, error: "apiPutBpmnXml unavailable" };
    }

    const saved = await apiPutBpmnXml(sid, xml, { rev: targetRev, reason });
    if (!saved?.ok) {
      const status = asNumber(saved?.status, 0);
      const errorDetails = resolvePersistErrorDetails(saved);
      const errorCode = asText(
        saved?.errorCode
        || errorDetails.code
        || (status > 0 ? `http_${status}` : "persist_failed"),
      );
      const errorText = resolvePersistErrorText(saved, "failed to save bpmn", errorDetails, status);
      return {
        ok: false,
        status,
        errorCode,
        error: errorText,
        errorDetails: Object.keys(errorDetails).length ? errorDetails : null,
      };
    }
    const storedRev = asNumber(saved?.storedRev, targetRev);
    // eslint-disable-next-line no-console
    console.debug(
      `PERSIST_OK sid=${sid} rev=${storedRev} hash=${fnv1aHex(xml)} len=${xml.length} `
      + `key="${snapshotStorageKey(snapshotProjectId(), sid)}"`,
    );
    try {
      if (typeof window !== "undefined") {
        window.__FPC_LAST_PERSIST_OK__ = {
          sid,
          rev: storedRev,
          hash: fnv1aHex(xml),
          len: xml.length,
          ts: Date.now(),
        };
      }
    } catch {
      // no-op
    }
    writeRuntimeCache(sid, xml, storedRev, reason);
    await maybeSaveSnapshot(sid, xml, reason, storedRev, false);
    return {
      ok: true,
      status: asNumber(saved?.status, 200),
      source: "backend",
      storedRev,
      rev: storedRev,
      hash: fnv1aHex(xml),
      bpmnVersionSnapshot: saved?.bpmnVersionSnapshot && typeof saved.bpmnVersionSnapshot === "object"
        ? saved.bpmnVersionSnapshot
        : null,
    };
  }

  return {
    loadRaw,
    saveRaw,
    cacheRaw: (sessionId, xmlText, rev = 0, reason = "runtime_change") => {
      const cached = writeRuntimeCache(sessionId, xmlText, rev, reason);
      return {
        ok: !!cached,
        source: cached?.source || "runtime_cache",
        rev: asNumber(cached?.rev, 0),
        hash: asText(cached?.hash || ""),
      };
    },
  };
}
