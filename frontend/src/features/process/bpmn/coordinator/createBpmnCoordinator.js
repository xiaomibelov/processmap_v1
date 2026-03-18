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

export default function createBpmnCoordinator(options = {}) {
  const store = options?.store;
  const getRuntime = typeof options?.getRuntime === "function" ? options.getRuntime : () => null;
  const getSessionId = typeof options?.getSessionId === "function" ? options.getSessionId : () => "";
  const persistence = options?.persistence && typeof options.persistence === "object"
    ? options.persistence
    : {};
  const debounceMs = asNumber(options?.debounceMs, 180);
  const onTrace = typeof options?.onTrace === "function" ? options.onTrace : null;
  const onRuntimeChange = typeof options?.onRuntimeChange === "function" ? options.onRuntimeChange : null;
  const onRuntimeStatus = typeof options?.onRuntimeStatus === "function" ? options.onRuntimeStatus : null;

  let runtimeUnsubChange = null;
  let runtimeUnsubStatus = null;
  let saveTimer = 0;
  let pendingReplayTimer = 0;
  let pendingSave = null;
  let saveInFlight = false;
  let saveQueuedRev = 0;
  let flushPromise = null;

  function emit(event, payload = {}) {
    if (!onTrace) return;
    try {
      onTrace(String(event || "unknown"), payload);
    } catch {
      // no-op
    }
  }

  function clearSaveTimer() {
    if (!saveTimer) return;
    window.clearTimeout(saveTimer);
    saveTimer = 0;
  }

  function clearPendingReplayTimer() {
    if (!pendingReplayTimer) return;
    window.clearTimeout(pendingReplayTimer);
    pendingReplayTimer = 0;
  }

  function clearPendingSave() {
    pendingSave = null;
    clearPendingReplayTimer();
  }

  function currentSid() {
    return asText(getSessionId?.() || "").trim();
  }

  function setPendingSave(entry) {
    pendingSave = {
      sessionId: asText(entry?.sessionId || "").trim(),
      runtimeToken: asNumber(entry?.runtimeToken, 0),
      targetRev: asNumber(entry?.targetRev, 0),
      reason: asText(entry?.reason || "unknown"),
      at: Date.now(),
    };
    emit("PENDING_SAVE_SET", pendingSave);
  }

  function isPendingMatch(status) {
    if (!pendingSave) return false;
    const sid = currentSid();
    if (!sid || sid !== pendingSave.sessionId) return false;
    const token = asNumber(status?.token, -1);
    return token === asNumber(pendingSave.runtimeToken, -2);
  }

  function schedulePendingReplay() {
    clearPendingReplayTimer();
    pendingReplayTimer = window.setTimeout(() => {
      pendingReplayTimer = 0;
      void flushSave("pending_replay", { fromPending: true });
    }, 90);
  }

  async function applyRuntimeChange(ev) {
    if (!store) return;
    const sid = currentSid();
    if (!sid) return;
    onRuntimeChange?.(ev);
    const runtime = getRuntime();
    const status = runtime?.getStatus?.();
    let nextXml = asText(store.getState?.()?.xml || "");
    if (status?.ready && status?.defs) {
      const xmlRes = await runtime.getXml({ format: true });
      if (xmlRes?.ok) nextXml = asText(xmlRes.xml);
    }
    const nextState = store.setXml(nextXml, "runtime_change", { bumpRev: true, dirty: true });
    cacheRaw(sid, nextXml, asNumber(nextState?.rev, 0), "runtime_change");
    emit("REV_BUMP", {
      sid,
      rev: asNumber(nextState?.rev, 0),
      reason: "runtime_change",
    });
    scheduleSave("autosave");
  }

  function applyRuntimeStatus(status) {
    onRuntimeStatus?.(status);
    if (!status?.ready || !status?.defs) return;
    if (!isPendingMatch(status)) return;
    emit("PENDING_SAVE_REPLAY", {
      sessionId: pendingSave?.sessionId,
      runtimeToken: pendingSave?.runtimeToken,
      targetRev: pendingSave?.targetRev,
    });
    schedulePendingReplay();
  }

  async function persistRaw(sid, xml, rev, reason) {
    const saveRaw = persistence?.saveRaw;
    if (typeof saveRaw !== "function") {
      return { ok: false, error: "saveRaw unavailable", status: 0 };
    }
    return await saveRaw(sid, xml, rev, reason);
  }

  function cacheRaw(sid, xml, rev, reason) {
    const cacheRawFn = persistence?.cacheRaw;
    if (typeof cacheRawFn !== "function") return { ok: false, source: "runtime_cache" };
    try {
      return cacheRawFn(sid, xml, rev, reason);
    } catch {
      return { ok: false, source: "runtime_cache" };
    }
  }

  async function loadRaw(sid, optionsForLoad = {}) {
    const loadRawFn = persistence?.loadRaw;
    if (typeof loadRawFn !== "function") {
      return { ok: false, error: "loadRaw unavailable", status: 0 };
    }
    return await loadRawFn(sid, optionsForLoad);
  }

  async function doFlush(reason = "manual", options = {}) {
    const sid = currentSid();
    if (!sid || !store) {
      return {
        ok: false,
        rev: 0,
        status: 0,
        errorCode: "missing_session",
        error: "missing session",
      };
    }
    const state = store.getState();
    const runtime = getRuntime();
    const status = runtime?.getStatus?.() || {};
    const rev = asNumber(state?.rev, 0);
    emit("SAVE_REQUESTED", {
      sid,
      reason,
      rev,
      dirty: state?.dirty ? 1 : 0,
      runtime_ready: status?.ready ? 1 : 0,
      runtime_defs: status?.defs ? 1 : 0,
      runtime_token: asNumber(status?.token, 0),
    });

    if (!status?.ready || !status?.defs) {
      setPendingSave({
        sessionId: sid,
        runtimeToken: asNumber(status?.token, 0),
        targetRev: rev,
        reason,
      });
      emit("SAVE_SKIPPED_NOT_READY", {
        sid,
        reason,
        rev,
        runtime_ready: status?.ready ? 1 : 0,
        runtime_defs: status?.defs ? 1 : 0,
      });
      const fallbackXml = asText(state?.xml || "");
      if (fallbackXml.trim()) {
        emit("SAVE_PERSIST_STARTED", {
          sid,
          reason: `${reason}:fallback`,
          rev,
          xml_len: fallbackXml.length,
        });
        const startedAt = Date.now();
        const persisted = await persistRaw(sid, fallbackXml, rev, `${reason}:fallback`);
        if (persisted?.ok) {
          emit("SAVE_PERSIST_DONE", {
            sid,
            reason: `${reason}:fallback`,
            rev,
            status: asNumber(persisted?.status, 200),
            ms: Date.now() - startedAt,
          });
          // Keep dirty=true to force true runtime save when ready.
        } else {
          emit("SAVE_PERSIST_FAIL", {
            sid,
            reason: `${reason}:fallback`,
            rev,
            status: asNumber(persisted?.status, 0),
            error: asText(persisted?.error || "persist fallback failed"),
          });
        }
      }
      return { ok: true, pending: true, rev };
    }

    const xmlRes = await runtime.getXml({ format: true });
    if (!xmlRes?.ok) {
      if (xmlRes?.reason === "not_ready" || xmlRes?.reason === "stale") {
        setPendingSave({
          sessionId: sid,
          runtimeToken: asNumber(runtime.getStatus?.()?.token, 0),
          targetRev: rev,
          reason,
        });
        emit("SAVE_SKIPPED_NOT_READY", {
          sid,
          reason,
          rev,
          runtime_ready: runtime.getStatus?.()?.ready ? 1 : 0,
          runtime_defs: runtime.getStatus?.()?.defs ? 1 : 0,
          save_reason: asText(xmlRes?.reason),
        });
        return { ok: true, pending: true, rev };
      }
      return {
        ok: false,
        rev,
        status: asNumber(xmlRes?.status, 0),
        errorCode: asText(xmlRes?.reason || "runtime_get_xml_failed"),
        error: asText(xmlRes?.error || xmlRes?.reason || "getXml failed"),
      };
    }

    const xml = asText(xmlRes?.xml);
    const currentXmlHash = fnv1aHex(xml);
    const localHash = asText(state?.lastHash || state?.hash || "");
    const localDirty = state?.dirty === true;
    const localLastSavedRev = asNumber(state?.lastSavedRev, 0);
    if (!localDirty && currentXmlHash && localHash && currentXmlHash === localHash && localLastSavedRev >= rev) {
      emit("SAVE_PERSIST_SKIPPED_UNCHANGED", {
        sid,
        reason,
        rev,
        last_saved_rev: localLastSavedRev,
        xml_len: xml.length,
      });
      return {
        ok: true,
        rev: localLastSavedRev || rev,
        storedRev: localLastSavedRev || rev,
        skipped: true,
        unchanged: true,
        xml,
        hash: currentXmlHash,
      };
    }
    const refreshed = store.setXml(xml, "flush_save", { bumpRev: false, dirty: true });
    const targetRev = asNumber(refreshed?.rev, rev);
    emit("SAVE_EXECUTED", {
      sid,
      reason,
      rev: targetRev,
      runtime_token: asNumber(xmlRes?.token, 0),
      xml_len: xml.length,
    });
    emit("SAVE_PERSIST_STARTED", {
      sid,
      reason,
      rev: targetRev,
      xml_len: xml.length,
    });
    const startedAt = Date.now();
    const persisted = await persistRaw(sid, xml, targetRev, reason);
    if (!persisted?.ok) {
      const status = asNumber(persisted?.status, 0);
      emit("SAVE_PERSIST_FAIL", {
        sid,
        reason,
        rev: targetRev,
        status,
        error: asText(persisted?.error || "persist failed"),
      });
      return {
        ok: false,
        rev: targetRev,
        status,
        errorCode: asText(persisted?.errorCode || (status > 0 ? `http_${status}` : "persist_failed")),
        error: asText(persisted?.error || "persist failed"),
      };
    }
    const storedRev = asNumber(persisted?.storedRev, targetRev);
    const xmlHash = asText(persisted?.hash || fnv1aHex(xml));
    cacheRaw(sid, xml, storedRev, reason);
    store.markSaved(storedRev, xmlHash);
    if (pendingSave && pendingSave.sessionId === sid && pendingSave.targetRev <= targetRev) {
      clearPendingSave();
    }
    emit("SAVE_PERSIST_DONE", {
      sid,
      reason,
      rev: storedRev,
      status: asNumber(persisted?.status, 200),
      ms: Date.now() - startedAt,
    });
    return { ok: true, rev: storedRev, storedRev };
  }

  function scheduleSave(reason = "autosave") {
    if (!store) return;
    const state = store.getState();
    saveQueuedRev = Math.max(saveQueuedRev, asNumber(state?.rev, 0));
    clearSaveTimer();
    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
      void flushSave(reason);
    }, debounceMs);
  }

  async function flushSave(reason = "manual", options = {}) {
    clearSaveTimer();
    if (!store) return { ok: false, rev: 0, error: "store unavailable" };
    if (flushPromise) {
      await flushPromise;
    }
    const run = (async () => {
      saveInFlight = true;
      try {
        const result = await doFlush(reason, options);
        const state = store.getState();
        const localRev = asNumber(state?.rev, 0);
        if (saveQueuedRev > asNumber(state?.lastSavedRev, 0) && !result?.pending) {
          saveQueuedRev = Math.max(saveQueuedRev, localRev);
          if (localRev > asNumber(state?.lastSavedRev, 0)) {
            return await doFlush("queued", options);
          }
        }
        return result;
      } finally {
        saveInFlight = false;
      }
    })();
    flushPromise = run;
    try {
      return await run;
    } finally {
      if (flushPromise === run) flushPromise = null;
    }
  }

  function bindRuntime(runtime) {
    if (typeof runtimeUnsubChange === "function") {
      try {
        runtimeUnsubChange();
      } catch {
      }
    }
    if (typeof runtimeUnsubStatus === "function") {
      try {
        runtimeUnsubStatus();
      } catch {
      }
    }
    runtimeUnsubChange = null;
    runtimeUnsubStatus = null;
    if (!runtime) return;
    runtimeUnsubChange = runtime.onChange((ev) => {
      void applyRuntimeChange(ev);
    });
    runtimeUnsubStatus = runtime.onStatus((status) => {
      applyRuntimeStatus(status);
    });
  }

  function unbindRuntime() {
    if (typeof runtimeUnsubChange === "function") {
      try {
        runtimeUnsubChange();
      } catch {
      }
    }
    if (typeof runtimeUnsubStatus === "function") {
      try {
        runtimeUnsubStatus();
      } catch {
      }
    }
    runtimeUnsubChange = null;
    runtimeUnsubStatus = null;
  }

  function syncExternalXml(xml, source = "external", options = {}) {
    if (!store) return null;
    return store.setXml(xml, source, {
      bumpRev: options?.bumpRev === true,
      dirty: options?.dirty === true,
      loadedRev: options?.loadedRev,
    });
  }

  async function reload(optionsForReload = {}) {
    const sid = currentSid();
    if (!sid || !store) return { ok: false, error: "missing session", applied: false };
    const state = store.getState();
    const localXml = asText(state?.xml || "");
    const localRev = asNumber(state?.rev, 0);
    const localHash = asText(state?.lastHash || state?.hash || fnv1aHex(localXml));
    const preferStore = optionsForReload?.preferStore === true;

    if (preferStore && localXml.trim()) {
      emit("LOAD_SKIPPED_STORE_PRIORITY", {
        sid,
        rev: localRev,
        hash: localHash,
      });
      return {
        ok: true,
        applied: false,
        reason: "store_priority",
        source: "store",
        xml: localXml,
        rev: localRev,
        hash: localHash,
      };
    }

    emit("LOAD_REQUESTED", {
      sid,
      rev: localRev,
      dirty: state?.dirty ? 1 : 0,
    });
    const loaded = await loadRaw(sid, optionsForReload);
    if (!loaded?.ok) {
      emit("LOAD_FAILED", {
        sid,
        status: asNumber(loaded?.status, 0),
        error: asText(loaded?.error || "load failed"),
      });
      return {
        ok: false,
        applied: false,
        status: asNumber(loaded?.status, 0),
        error: asText(loaded?.error || "load failed"),
      };
    }

    const loadedXml = asText(loaded?.xml || "");
    const loadedRev = asNumber(loaded?.rev, 0);
    const loadedHash = asText(loaded?.hash || fnv1aHex(loadedXml));
    const source = asText(loaded?.source || "persistence");
    const sourceReason = asText(loaded?.sourceReason || "");

    if (loadedRev > 0 && loadedRev < localRev) {
      emit("LOAD_SKIPPED_OLDER_REV", {
        sid,
        loaded_rev: loadedRev,
        local_rev: localRev,
        source,
      });
      return {
        ok: true,
        applied: false,
        reason: "older_rev",
        source,
        xml: localXml,
        rev: localRev,
        hash: localHash,
      };
    }

    if (state?.dirty && localXml.trim() && loadedHash && localHash && loadedHash !== localHash) {
      emit("LOAD_SKIPPED_DIRTY_LOCAL", {
        sid,
        loaded_rev: loadedRev,
        local_rev: localRev,
        loaded_hash: loadedHash,
        local_hash: localHash,
        source,
      });
      return {
        ok: true,
        applied: false,
        reason: "dirty_local_newer",
        source,
        xml: localXml,
        rev: localRev,
        hash: localHash,
      };
    }

    const applied = store.setXml(loadedXml, source, {
      bumpRev: false,
      dirty: false,
      loadedRev,
    });
    const appliedRev = asNumber(applied?.rev, localRev);
    const markRev = loadedRev > 0 ? loadedRev : appliedRev;
    store.markLoaded(markRev, loadedHash);
    emit("LOAD_APPLIED", {
      sid,
      source,
      source_reason: sourceReason,
      loaded_rev: loadedRev,
      local_rev: appliedRev,
      hash: loadedHash,
      xml_len: loadedXml.length,
    });
    return {
      ok: true,
      applied: true,
      source,
      sourceReason,
      xml: loadedXml,
      rev: appliedRev,
      loadedRev: markRev,
      hash: loadedHash,
    };
  }

  function getDebugState() {
    return {
      pendingSave: pendingSave ? { ...pendingSave } : null,
      saveInFlight,
      saveQueuedRev,
      store: store?.getState?.() || null,
    };
  }

  function isFlushing() {
    return !!saveInFlight || !!flushPromise;
  }

  function clearPendingWork(reason = "manual_clear") {
    clearSaveTimer();
    clearPendingReplayTimer();
    clearPendingSave();
    const lastSavedRev = asNumber(store?.getState?.()?.lastSavedRev, 0);
    saveQueuedRev = Math.max(saveQueuedRev, lastSavedRev);
    emit("SAVE_QUEUE_CLEARED", {
      reason: asText(reason || "manual_clear"),
      last_saved_rev: lastSavedRev,
    });
  }

  function destroy() {
    clearPendingWork("destroy");
    unbindRuntime();
    flushPromise = null;
    saveInFlight = false;
    saveQueuedRev = 0;
  }

  return {
    bindRuntime,
    unbindRuntime,
    scheduleSave,
    flushSave,
    reload,
    syncExternalXml,
    getDebugState,
    isFlushing,
    clearPendingWork,
    destroy,
  };
}
