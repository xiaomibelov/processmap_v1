function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function toText(v) {
  return String(v || "").trim();
}

function resolveRefs(ctx) {
  return asObject(ctx?.refs);
}

function resolveValues(ctx) {
  return asObject(ctx?.values);
}

function resolveHelpers(ctx) {
  return asObject(ctx?.helpers);
}

function resolveCallbacks(ctx) {
  return asObject(ctx?.callbacks);
}

export async function ensureCanvasVisibleAndFit(ctx, inst, options = {}) {
  if (!inst) return;
  const helpers = resolveHelpers(ctx);
  const getCanvasSnapshot = helpers.getCanvasSnapshot;
  const waitForNonZeroRect = helpers.waitForNonZeroRect;
  const probeCanvas = helpers.probeCanvas;
  const safeFit = helpers.safeFit;
  const isAnyShapeInViewport = helpers.isAnyShapeInViewport;
  const logCanvasMetrics = helpers.logCanvasMetrics;
  const tag = String(options?.tag || "");
  const sid = String(options?.sid || "");

  const reason = String(options?.reason || tag || "canvas").trim() || "canvas";
  const tab = String(options?.tab || "-");
  const token = Number(options?.token || 0);
  const allowFit = options?.allowFit !== false;
  const fitIfInvisible = options?.fitIfInvisible !== false;
  const suppress = typeof options?.suppressViewbox === "function"
    ? options.suppressViewbox
    : null;
  const cycleIndex = Number(options?.cycleIndex || 0);
  let before = typeof getCanvasSnapshot === "function"
    ? getCanvasSnapshot(inst)
    : { zoom: 0, count: 0, viewbox: { x: 0, y: 0, width: 0, height: 0 } };

  const layoutReady = typeof waitForNonZeroRect === "function"
    ? await waitForNonZeroRect(
      () => inst?.get?.("canvas")?._container || null,
      {
        sid: String(sid || "-"),
        token,
        reason: `${reason}:before_canvas_ops`,
        timeoutMs: 3000,
      },
    )
    : { ok: true };
  if (!layoutReady.ok) {
    return;
  }
  try {
    const canvas = inst.get("canvas");
    const container = canvas?._container;
    const rect = container?.getBoundingClientRect?.();
    const width = Number(rect?.width || container?.clientWidth || 0);
    const height = Number(rect?.height || container?.clientHeight || 0);
    suppress?.(1);
    try {
      canvas?.resized?.();
    } finally {
      suppress?.(-1);
    }
    const afterResized = typeof getCanvasSnapshot === "function"
      ? getCanvasSnapshot(inst)
      : before;
    helpers.logViewAction?.("resized", before, afterResized, {
      reason,
      tab,
      sid: String(sid || "-"),
      token,
    });
    before = afterResized;
    if (!width || !height) {
      window.setTimeout(async () => {
        try {
          const b = typeof getCanvasSnapshot === "function"
            ? getCanvasSnapshot(inst)
            : before;
          suppress?.(1);
          try {
            canvas?.resized?.();
          } finally {
            suppress?.(-1);
          }
          const a = typeof getCanvasSnapshot === "function"
            ? getCanvasSnapshot(inst)
            : b;
          helpers.logViewAction?.("resized", b, a, {
            reason: `${reason}:post_show`,
            tab,
            sid: String(sid || "-"),
            token,
          });
          if (allowFit) {
            const probe = typeof probeCanvas === "function"
              ? probeCanvas(inst, `${String(tag || "canvas")}.post_show_probe`, {
                tab,
                sid: String(sid || "-"),
                token,
                reason: `${reason}:post_show`,
                cycleIndex,
              })
              : { invisible: false, zoom: 1 };
            if (probe.invisible || !Number.isFinite(probe.zoom) || probe.zoom <= 0) {
              await safeFit?.(inst, {
                reason: `${reason}:post_show`,
                tab,
                sid,
                token,
                suppressViewbox: suppress,
              });
            }
          }
          logCanvasMetrics?.(inst, `${String(tag || "canvas")}.post_show`, sid);
        } catch {
        }
      }, 90);
    }
  } catch {
  }
  if (allowFit) {
    const hasVisibleShapes = typeof isAnyShapeInViewport === "function"
      ? isAnyShapeInViewport(inst)
      : true;
    const afterResized = typeof getCanvasSnapshot === "function"
      ? getCanvasSnapshot(inst)
      : before;
    const shouldFit = !Number.isFinite(afterResized.zoom)
      || afterResized.zoom <= 0
      || (fitIfInvisible && afterResized.count > 0 && !hasVisibleShapes);
    if (shouldFit) {
      await safeFit?.(inst, {
        reason,
        tab,
        sid,
        token,
        suppressViewbox: suppress,
      });
    }
  }
  logCanvasMetrics?.(inst, tag, sid);
}

export async function recoverByReimport(ctx, inst, options = {}) {
  const refs = resolveRefs(ctx);
  const values = resolveValues(ctx);
  const callbacks = resolveCallbacks(ctx);
  const raw = String(options?.xmlText || "");
  const reason = String(options?.reason || "recover2");
  const cycleIndex = Number(options?.cycleIndex || 0);
  const guard = typeof options?.guard === "function" ? options.guard : null;
  if (!raw.trim()) return false;
  const sid = String(values.sessionId || "");
  if (guard && !guard("recover2.start", inst)) return false;
  if (inst === refs.modelerRef?.current) {
    if (guard && !guard("recover2.modeler.before_load", inst)) return false;
    const runtime = callbacks.ensureModelerRuntime?.();
    const loaded = await runtime?.load?.(raw, { source: `${reason}:recover2` });
    if (guard && !guard("recover2.modeler.after_load", inst, { allowTokenDrift: true, syncToken: true })) {
      return false;
    }
    const status = runtime?.getStatus?.() || {};
    refs.runtimeTokenRef.current = Number(status?.token || refs.runtimeTokenRef.current || 0);
    refs.modelerReadyRef.current = !!status?.ready && !!status?.defs;
    if (!loaded?.ok || loaded?.reason === "stale" || inst !== refs.modelerRef?.current) return false;
    refs.lastModelerXmlHashRef.current = callbacks.fnv1aHex?.(raw) || "";
    await ensureCanvasVisibleAndFit(ctx, inst, {
      tag: "recover2.modeler",
      sid,
      reason,
      tab: "diagram",
      token: refs.runtimeTokenRef.current,
      allowFit: true,
      fitIfInvisible: true,
      suppressViewbox: callbacks.suppressViewboxEvents,
      cycleIndex,
    });
    callbacks.applyTaskTypeDecor?.(inst, "editor");
    callbacks.applyLinkEventDecor?.(inst, "editor");
    callbacks.applyHappyFlowDecor?.(inst, "editor");
    callbacks.applyRobotMetaDecor?.(inst, "editor");
    callbacks.applyBottleneckDecor?.(inst, "editor");
    callbacks.applyInterviewDecor?.(inst, "editor");
    callbacks.applyUserNotesDecor?.(inst, "editor");
    callbacks.applyStepTimeDecor?.(inst, "editor");
    return true;
  }

  if (inst === refs.viewerRef?.current) {
    if (guard && !guard("recover2.viewer.before_load", inst)) return false;
    const token = refs.runtimeTokenRef.current + 1;
    refs.runtimeTokenRef.current = token;
    refs.viewerReadyRef.current = false;
    await inst.importXML(raw);
    if (guard && !guard("recover2.viewer.after_load", inst, { allowTokenDrift: true, syncToken: true })) {
      return false;
    }
    if (token !== refs.runtimeTokenRef.current || inst !== refs.viewerRef?.current) return false;
    refs.viewerReadyRef.current = true;
    await ensureCanvasVisibleAndFit(ctx, inst, {
      tag: "recover2.viewer",
      sid,
      reason,
      tab: "diagram",
      token: refs.runtimeTokenRef.current,
      allowFit: true,
      fitIfInvisible: true,
      suppressViewbox: callbacks.suppressViewboxEvents,
      cycleIndex,
    });
    callbacks.applyTaskTypeDecor?.(inst, "viewer");
    callbacks.applyLinkEventDecor?.(inst, "viewer");
    callbacks.applyHappyFlowDecor?.(inst, "viewer");
    callbacks.applyRobotMetaDecor?.(inst, "viewer");
    callbacks.applyBottleneckDecor?.(inst, "viewer");
    callbacks.applyInterviewDecor?.(inst, "viewer");
    callbacks.applyUserNotesDecor?.(inst, "viewer");
    callbacks.applyStepTimeDecor?.(inst, "viewer");
    return true;
  }

  return false;
}

export async function recoverByHardReset(ctx, inst, options = {}) {
  const refs = resolveRefs(ctx);
  const values = resolveValues(ctx);
  const callbacks = resolveCallbacks(ctx);
  const raw = String(options?.xmlText || "");
  const reason = String(options?.reason || "recover3");
  const cycleIndex = Number(options?.cycleIndex || 0);
  const guard = typeof options?.guard === "function" ? options.guard : null;
  const sid = String(values.sessionId || "");
  if (guard && !guard("recover3.start", inst, { allowTokenDrift: true })) return false;
  if (inst === refs.modelerRef?.current) {
    if (guard && !guard("recover3.modeler.before_destroy", inst, { allowTokenDrift: true })) return false;
    try {
      refs.modelerRuntimeRef.current?.destroy?.();
    } catch {
    }
    refs.modelerRuntimeRef.current = null;
    refs.modelerRef.current = null;
    refs.modelerInitPromiseRef.current = null;
    refs.modelerDecorBoundInstanceRef.current = null;
    refs.modelerReadyRef.current = false;
    refs.userViewportTouchedRef.current = false;
    try {
      if (refs.editorEl?.current) refs.editorEl.current.innerHTML = "";
    } catch {
    }
    if (!raw.trim()) return false;
    const runtime = callbacks.ensureModelerRuntime?.();
    const m = await callbacks.ensureModeler?.();
    if (guard && !guard("recover3.modeler.after_init", m, { allowTokenDrift: true, syncToken: true })) return false;
    const loaded = await runtime?.load?.(raw, { source: `${reason}:recover3` });
    if (guard && !guard("recover3.modeler.after_load", m, { allowTokenDrift: true, syncToken: true })) return false;
    const status = runtime?.getStatus?.() || {};
    refs.runtimeTokenRef.current = Number(status?.token || refs.runtimeTokenRef.current || 0);
    refs.modelerReadyRef.current = !!status?.ready && !!status?.defs;
    if (!loaded?.ok || !m || m !== refs.modelerRef?.current) return false;
    refs.lastModelerXmlHashRef.current = callbacks.fnv1aHex?.(raw) || "";
    await ensureCanvasVisibleAndFit(ctx, m, {
      tag: "recover3.modeler",
      sid,
      reason,
      tab: "diagram",
      token: refs.runtimeTokenRef.current,
      allowFit: true,
      fitIfInvisible: true,
      suppressViewbox: callbacks.suppressViewboxEvents,
      cycleIndex,
    });
    callbacks.applyTaskTypeDecor?.(m, "editor");
    callbacks.applyLinkEventDecor?.(m, "editor");
    callbacks.applyHappyFlowDecor?.(m, "editor");
    callbacks.applyRobotMetaDecor?.(m, "editor");
    callbacks.applyBottleneckDecor?.(m, "editor");
    callbacks.applyInterviewDecor?.(m, "editor");
    callbacks.applyUserNotesDecor?.(m, "editor");
    callbacks.applyStepTimeDecor?.(m, "editor");
    return true;
  }

  if (inst === refs.viewerRef?.current) {
    if (guard && !guard("recover3.viewer.before_destroy", inst, { allowTokenDrift: true })) return false;
    try {
      refs.viewerRef.current?.destroy?.();
    } catch {
    }
    refs.viewerRef.current = null;
    refs.viewerInitPromiseRef.current = null;
    refs.viewerReadyRef.current = false;
    try {
      if (refs.viewerEl?.current) refs.viewerEl.current.innerHTML = "";
    } catch {
    }
    if (!raw.trim()) return false;
    const v = await callbacks.ensureViewer?.();
    if (guard && !guard("recover3.viewer.after_init", v, { allowTokenDrift: true, syncToken: true })) return false;
    const token = refs.runtimeTokenRef.current + 1;
    refs.runtimeTokenRef.current = token;
    await v.importXML(raw);
    if (guard && !guard("recover3.viewer.after_load", v, { allowTokenDrift: true, syncToken: true })) return false;
    if (token !== refs.runtimeTokenRef.current || v !== refs.viewerRef?.current) return false;
    refs.viewerReadyRef.current = true;
    await ensureCanvasVisibleAndFit(ctx, v, {
      tag: "recover3.viewer",
      sid,
      reason,
      tab: "diagram",
      token: refs.runtimeTokenRef.current,
      allowFit: true,
      fitIfInvisible: true,
      suppressViewbox: callbacks.suppressViewboxEvents,
      cycleIndex,
    });
    callbacks.applyTaskTypeDecor?.(v, "viewer");
    callbacks.applyLinkEventDecor?.(v, "viewer");
    callbacks.applyHappyFlowDecor?.(v, "viewer");
    callbacks.applyRobotMetaDecor?.(v, "viewer");
    callbacks.applyBottleneckDecor?.(v, "viewer");
    callbacks.applyInterviewDecor?.(v, "viewer");
    callbacks.applyUserNotesDecor?.(v, "viewer");
    callbacks.applyStepTimeDecor?.(v, "viewer");
    return true;
  }

  return false;
}

export async function ensureVisibleOnInstance(ctx, inst, options = {}) {
  const refs = resolveRefs(ctx);
  const values = resolveValues(ctx);
  const helpers = resolveHelpers(ctx);
  const callbacks = resolveCallbacks(ctx);
  if (!inst) return { ok: false, reason: "missing_instance" };
  const sid = String(refs.activeSessionRef?.current || values.sessionId || "");
  const tabName = String(options?.tab || (values.view === "xml" ? "xml" : "diagram"));
  const reason = String(options?.reason || "ensure_visible").trim() || "ensure_visible";
  const cycleIndex = Number(options?.cycleIndex || (++refs.ensureVisibleCycleRef.current));
  const tokenState = { value: Number(refs.runtimeTokenRef.current || 0) };
  const expectedSid = String(options?.expectedSid || sid || "").trim();
  const expectedEpoch = Number(options?.expectedEpoch || refs.ensureEpochRef.current || 0);
  const expectedContainerKey = String(
    options?.containerKey
    || callbacks.getInstanceMeta?.(inst)?.containerKey
    || "",
  ).trim();
  const instanceMeta = asObject(callbacks.getInstanceMeta?.(inst));
  const requestedSid = String(sid || "-");
  const expectElements = options?.expectElements === true
    || String(callbacks.getRecoveryXmlCandidate?.() || "").trim().length > 0;

  callbacks.logEnsureTrace?.("start", {
    sid: requestedSid,
    requestedSid,
    expectedSid: expectedSid || "-",
    tab: tabName,
    reason,
    cycle: cycleIndex,
    token: Number(tokenState.value || 0),
    instanceId: Number(instanceMeta.id || 0),
    containerKey: String(instanceMeta.containerKey || "-"),
  });

  const guard = (phase, candidateInst, guardOptions = {}) => {
    const currentSid = String(refs.activeSessionRef?.current || "");
    const currentEpoch = Number(refs.ensureEpochRef.current || 0);
    const activeInst = candidateInst || inst;
    const activeMeta = asObject(callbacks.getInstanceMeta?.(activeInst));
    const currentToken = Number(refs.runtimeTokenRef.current || 0);
    const allowTokenDrift = guardOptions?.allowTokenDrift === true;

    if (expectedEpoch && currentEpoch !== expectedEpoch) {
      callbacks.logStaleGuard?.("epoch_mismatch", {
        phase,
        expectedEpoch,
        currentEpoch,
        expectedSid: expectedSid || "-",
        currentSid: currentSid || "-",
      });
      return false;
    }
    if (expectedSid && currentSid && expectedSid !== currentSid) {
      callbacks.logStaleGuard?.("sid_mismatch", {
        phase,
        expectedSid,
        currentSid,
        expectedToken: Number(tokenState.value || 0),
        currentToken,
      });
      return false;
    }
    if (activeInst && activeInst !== refs.modelerRef?.current && activeInst !== refs.viewerRef?.current) {
      callbacks.logStaleGuard?.("instance_mismatch", {
        phase,
        expectedSid: expectedSid || "-",
        currentSid: currentSid || "-",
        expectedInstanceId: Number(instanceMeta.id || 0),
        currentInstanceId: Number(activeMeta.id || 0),
      });
      return false;
    }
    if (expectedContainerKey && activeMeta.containerKey && expectedContainerKey !== activeMeta.containerKey) {
      callbacks.logStaleGuard?.("container_mismatch", {
        phase,
        expectedContainerKey,
        currentContainerKey: String(activeMeta.containerKey || "-"),
        expectedSid: expectedSid || "-",
        currentSid: currentSid || "-",
      });
      return false;
    }
    if (!allowTokenDrift && Number(tokenState.value || 0) !== currentToken) {
      callbacks.logStaleGuard?.("token_mismatch", {
        phase,
        expectedToken: Number(tokenState.value || 0),
        currentToken,
        expectedSid: expectedSid || "-",
        currentSid: currentSid || "-",
      });
      return false;
    }
    if (guardOptions?.syncToken === true) {
      tokenState.value = currentToken;
    }
    return true;
  };

  const existingPromise = refs.ensureVisiblePromiseRef.current;
  if (existingPromise && options?.force !== true) {
    return await existingPromise;
  }

  const run = (async () => {
    if (!guard("ensure.enter", inst)) {
      return { ok: false, reason: "skip_stale", step: 0 };
    }
    const enter = helpers.probeCanvas?.(inst, "after_tab_show", {
      sid,
      tab: tabName,
      token: Number(tokenState.value || 0),
      reason,
      cycleIndex,
      expectElements,
    }) || { invisible: false };
    if (!enter.invisible) {
      callbacks.logEnsureTrace?.("done", {
        sid: requestedSid,
        expectedSid: expectedSid || "-",
        tab: tabName,
        step: 0,
        result: "ok",
        cycle: cycleIndex,
      });
      return { ok: true, recovered: false, step: 0, probe: enter };
    }

    const layoutReady = await helpers.waitForNonZeroRect?.(
      () => inst?.get?.("canvas")?._container || null,
      {
        sid: requestedSid,
        token: Number(tokenState.value || 0),
        reason: `${reason}:ensure_visible_layout_gate`,
        timeoutMs: 3000,
      },
    );
    if (!layoutReady?.ok) {
      return { ok: false, reason: "layout_not_ready", step: 0, probe: enter };
    }

    try {
      if (!guard("recover1.before_resize", inst)) return { ok: false, reason: "skip_stale", step: 1 };
      const canvas = inst.get("canvas");
      await helpers.waitAnimationFrame?.();
      if (!guard("recover1.after_raf", inst)) return { ok: false, reason: "skip_stale", step: 1 };
      callbacks.suppressViewboxEvents?.(1);
      try {
        canvas?.resized?.();
      } finally {
        callbacks.suppressViewboxEvents?.(-1);
      }
      await helpers.waitAnimationFrame?.();
      if (!guard("recover1.after_resize", inst)) return { ok: false, reason: "skip_stale", step: 1 };
    } catch {
    }
    let probeAfterRecover1 = helpers.probeCanvas?.(inst, "after_recover1", {
      sid,
      tab: tabName,
      token: Number(tokenState.value || 0),
      reason,
      cycleIndex,
      expectElements,
    }) || { invisible: false };
    if (probeAfterRecover1.invisible) {
      if (!guard("recover1.before_fit", inst)) return { ok: false, reason: "skip_stale", step: 1 };
      await helpers.safeFit?.(inst, {
        reason: `${reason}:recover1_fit`,
        tab: tabName,
        sid,
        token: Number(tokenState.value || 0),
        suppressViewbox: callbacks.suppressViewboxEvents,
      });
      await helpers.waitAnimationFrame?.();
      if (!guard("recover1.after_fit", inst)) return { ok: false, reason: "skip_stale", step: 1 };
      probeAfterRecover1 = helpers.probeCanvas?.(inst, "after_recover1_fit", {
        sid,
        tab: tabName,
        token: Number(tokenState.value || 0),
        reason,
        cycleIndex,
        expectElements,
      }) || probeAfterRecover1;
    }
    if (!probeAfterRecover1.invisible) {
      callbacks.logEnsureTrace?.("done", {
        sid: requestedSid,
        expectedSid: expectedSid || "-",
        tab: tabName,
        step: 1,
        result: "ok",
        cycle: cycleIndex,
      });
      return { ok: true, recovered: true, step: 1, probe: probeAfterRecover1 };
    }

    const xmlForRecovery = String(callbacks.getRecoveryXmlCandidate?.() || "");
    if (xmlForRecovery.trim()) {
      const reimported = await recoverByReimport(ctx, inst, {
        xmlText: xmlForRecovery,
        reason,
        cycleIndex,
        guard,
      });
      if (reimported) {
        const currentInst = inst === refs.modelerRef?.current ? refs.modelerRef?.current : refs.viewerRef?.current;
        const probeAfterRecover2 = helpers.probeCanvas?.(currentInst || inst, "after_recover2", {
          sid,
          tab: tabName,
          token: Number(refs.runtimeTokenRef.current || tokenState.value || 0),
          reason,
          cycleIndex,
          expectElements,
        }) || { invisible: true };
        if (!probeAfterRecover2.invisible) {
          callbacks.logEnsureTrace?.("done", {
            sid: requestedSid,
            expectedSid: expectedSid || "-",
            tab: tabName,
            step: 2,
            result: "ok",
            cycle: cycleIndex,
          });
          return { ok: true, recovered: true, step: 2, probe: probeAfterRecover2 };
        }
      }
    }

    const hardResetOk = await recoverByHardReset(ctx, inst, {
      xmlText: xmlForRecovery,
      reason,
      cycleIndex,
      guard,
    });
    const currentInst = inst === refs.modelerRef?.current ? refs.modelerRef?.current : refs.viewerRef?.current;
    const probeAfterRecover3 = helpers.probeCanvas?.(currentInst || inst, "after_recover3", {
      sid,
      tab: tabName,
      token: Number(refs.runtimeTokenRef.current || tokenState.value || 0),
      reason,
      cycleIndex,
      expectElements,
    }) || { invisible: true };
    if (hardResetOk && !probeAfterRecover3.invisible) {
      callbacks.logEnsureTrace?.("done", {
        sid: requestedSid,
        expectedSid: expectedSid || "-",
        tab: tabName,
        step: 3,
        result: "ok",
        cycle: cycleIndex,
      });
      return { ok: true, recovered: true, step: 3, probe: probeAfterRecover3 };
    }
    callbacks.logEnsureTrace?.("done", {
      sid: requestedSid,
      expectedSid: expectedSid || "-",
      tab: tabName,
      step: 3,
      result: hardResetOk ? "failed_visible" : "failed_reset",
      cycle: cycleIndex,
    });
    return {
      ok: false,
      recovered: hardResetOk,
      step: 3,
      reason: "still_invisible",
      probe: probeAfterRecover3,
    };
  })();

  refs.ensureVisiblePromiseRef.current = run;
  try {
    const result = await run;
    if (result?.reason === "skip_stale") {
      callbacks.logEnsureTrace?.("done", {
        sid: requestedSid,
        expectedSid: expectedSid || "-",
        tab: tabName,
        step: Number(result?.step || 0),
        result: "skip_stale",
        cycle: cycleIndex,
      });
    }
    return result;
  } finally {
    if (refs.ensureVisiblePromiseRef.current === run) {
      refs.ensureVisiblePromiseRef.current = null;
    }
  }
}

export default {
  ensureCanvasVisibleAndFit,
  ensureVisibleOnInstance,
  recoverByReimport,
  recoverByHardReset,
};
