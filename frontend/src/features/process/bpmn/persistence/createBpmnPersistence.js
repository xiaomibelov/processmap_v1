function asText(value) {
  return String(value || "");
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

    if (isLocalSessionId(sid)) {
      const xml = asText(window.localStorage?.getItem(getLocalStorageKey(sid)) || "");
      return {
        ok: true,
        status: 200,
        source: "local",
        xml,
        rev: asNumber(optionsForLoad?.rev, 0),
        hash: fnv1aHex(xml),
      };
    }

    const draft = getSessionDraft?.() || {};
    const draftXml = asText(draft?.bpmn_xml || "");
    const rev = draftRevision();
    if (draftXml.trim()) {
      emit("PERSISTENCE_LOAD_DRAFT", {
        sid,
        rev,
      });
      return {
        ok: true,
        status: 200,
        source: "draft",
        xml: draftXml,
        rev,
        hash: fnv1aHex(draftXml),
      };
    }

    if (typeof apiGetBpmnXml !== "function") {
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
            };
          }
        } catch {
        }
      }
      return { ok: false, status: 0, error: "apiGetBpmnXml unavailable" };
    }
    const loaded = await apiGetBpmnXml(sid);
    if (!loaded?.ok) {
      return {
        ok: false,
        status: asNumber(loaded?.status, 0),
        error: asText(loaded?.error || "failed to load bpmn"),
      };
    }
    const xml = asText(loaded?.xml || "");
    if (!xml.trim() && typeof loadLatestSnapshot === "function") {
      try {
        const snap = await loadLatestSnapshot({
          projectId: snapshotProjectId(),
          sessionId: sid,
        });
        const snapXml = asText(snap?.xml || "");
        if (snapXml.trim()) {
          emit("PERSISTENCE_LOAD_SNAPSHOT_RECOVER", {
            sid,
            rev: asNumber(snap?.rev, rev),
            hash: asText(snap?.hash || fnv1aHex(snapXml)),
          });
          return {
            ok: true,
            status: asNumber(loaded?.status, 200),
            source: "snapshot",
            xml: snapXml,
            rev: asNumber(snap?.rev, rev),
            hash: asText(snap?.hash || fnv1aHex(snapXml)),
          };
        }
      } catch {
      }
    }
    return {
      ok: true,
      status: asNumber(loaded?.status, 200),
      source: "backend",
      xml,
      rev,
      hash: fnv1aHex(xml),
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
      return {
        ok: false,
        status: asNumber(saved?.status, 0),
        error: asText(saved?.error || "failed to save bpmn"),
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
    await maybeSaveSnapshot(sid, xml, reason, storedRev, false);
    return {
      ok: true,
      status: asNumber(saved?.status, 200),
      source: "backend",
      storedRev,
      rev: storedRev,
      hash: fnv1aHex(xml),
    };
  }

  return {
    loadRaw,
    saveRaw,
  };
}
