import { useCallback, useRef, useState } from "react";

/**
 * Lightweight canvas lifecycle tracker.
 *
 * Encapsulates viewer/modeler creation, import, and destroy tracking.
 * Delegates actual bpmn-js work to the caller-provided functions
 * (ensureViewer, ensureModeler, renderViewer, renderModeler, destroyRuntime)
 * so that BpmnStage.jsx can keep its existing refs and imperative API.
 *
 * Returns:
 *   getInstance(kind)     — 'viewer' | 'modeler'
 *   importXml(kind, xml)  — async, returns result
 *   destroy()             — async cleanup
 *   lifecycleState        — 'idle' | 'creating' | 'importing' | 'ready' | 'error'
 *   publishEvent(name, detail) — notify state machine
 */
export default function useBpmnCanvasLifecycle(deps = {}) {
  const {
    ensureViewer,
    ensureModeler,
    renderViewer,
    renderModeler,
    destroyRuntime,
    viewerRef,
    modelerRef,
  } = deps;

  const [lifecycleState, setLifecycleState] = useState("idle");
  const lifecycleStateRef = useRef("idle");
  const instanceKeysRef = useRef({ viewer: "", modeler: "" });
  const listenersRef = useRef([]);

  const publishEvent = useCallback((name, detail = {}) => {
    listenersRef.current.forEach((fn) => {
      try {
        fn(name, detail);
      } catch {
        // ignore listener errors
      }
    });
  }, []);

  const subscribe = useCallback((fn) => {
    listenersRef.current.push(fn);
    return () => {
      listenersRef.current = listenersRef.current.filter((f) => f !== fn);
    };
  }, []);

  const setState = useCallback((next) => {
    lifecycleStateRef.current = next;
    setLifecycleState(next);
  }, []);

  const getInstance = useCallback(
    (kind) => {
      if (kind === "viewer") return viewerRef?.current || null;
      if (kind === "modeler") return modelerRef?.current || null;
      return null;
    },
    [viewerRef, modelerRef],
  );

  const importXml = useCallback(
    async (kind, xml) => {
      setState("importing");
      publishEvent("canvas:lifecycle:import:start", { kind, xmlLen: String(xml || "").length });
      try {
        if (kind === "viewer") {
          if (!ensureViewer) throw new Error("ensureViewer not provided");
          await ensureViewer();
          if (!renderViewer) throw new Error("renderViewer not provided");
          await renderViewer(xml);
        } else if (kind === "modeler") {
          if (!ensureModeler) throw new Error("ensureModeler not provided");
          await ensureModeler();
          if (!renderModeler) throw new Error("renderModeler not provided");
          await renderModeler(xml);
        } else {
          throw new Error(`unknown kind: ${kind}`);
        }
        setState("ready");
        publishEvent("canvas:lifecycle:import:success", { kind });
        return { ok: true, kind };
      } catch (err) {
        setState("error");
        publishEvent("canvas:lifecycle:import:error", { kind, reason: String(err?.message || err) });
        return { ok: false, kind, error: String(err?.message || err) };
      }
    },
    [ensureViewer, ensureModeler, renderViewer, renderModeler, setState, publishEvent],
  );

  const destroy = useCallback(async () => {
    setState("idle");
    publishEvent("canvas:lifecycle:destroy", {});
    if (typeof destroyRuntime === "function") {
      destroyRuntime();
    }
  }, [destroyRuntime, setState, publishEvent]);

  return {
    getInstance,
    importXml,
    destroy,
    lifecycleState,
    lifecycleStateRef,
    subscribe,
    publishEvent,
    instanceKeysRef,
  };
}
