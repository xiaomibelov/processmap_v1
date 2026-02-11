import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

import GraphEditorOverlay from "./GraphEditorOverlay";

const MOCK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://example.com/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_hot" name="Горячий цех">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_pack" name="Упаковка">
        <bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>

    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>

    <bpmn:task id="Task_1" name="Обжарка">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>

    <bpmn:task id="Task_2" name="Упаковка">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>

    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>

    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>
`;

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

function isCopilotTarget(el) {
  if (!el || !el.type) return false;
  if (el.labelTarget) return false;

  const t = el.type;

  if (
    t === "bpmn:Process" ||
    t === "bpmn:Lane" ||
    t === "bpmn:Participant" ||
    t === "bpmn:SequenceFlow" ||
    t === "bpmn:MessageFlow" ||
    t === "bpmn:Association"
  ) {
    return false;
  }

  return Boolean(
    t.endsWith("Task") ||
      t.endsWith("Event") ||
      t.endsWith("Gateway") ||
      t === "bpmn:SubProcess" ||
      t === "bpmn:CallActivity"
  );
}

async function fetchBpmnXml(sessionId) {
  if (!sessionId) return MOCK_XML;
  if (isLocalSessionId(sessionId)) return MOCK_XML;

  const url = `/api/sessions/${encodeURIComponent(sessionId)}/bpmn`;
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return MOCK_XML;
    const xml = await res.text();
    if (!xml || !xml.includes("<bpmn:definitions")) return MOCK_XML;
    return xml;
  } catch {
    return MOCK_XML;
  }
}

export default forwardRef(function BpmnStage(
  { sessionId, enabled = true, onElementClick, onViewportChange, onBackgroundClick },
  ref
) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const importXml = useMemo(() => {
    return async (fit = true) => {
      const v = viewerRef.current;
      if (!v) return;
      const xml = await fetchBpmnXml(sessionId);
      await v.importXML(xml);
      if (fit) v.get("canvas").zoom("fit-viewport");
    };
  }, [sessionId]);

  const api = useMemo(
    () => ({
      zoomIn() {
        const v = viewerRef.current;
        if (!v) return;
        const canvas = v.get("canvas");
        canvas.zoom(canvas.zoom() + 0.2);
      },
      zoomOut() {
        const v = viewerRef.current;
        if (!v) return;
        const canvas = v.get("canvas");
        canvas.zoom(Math.max(0.2, canvas.zoom() - 0.2));
      },
      fit() {
        const v = viewerRef.current;
        if (!v) return;
        v.get("canvas").zoom("fit-viewport");
      },
      async reload() {
        try {
          setError("");
          await importXml(true);
          setReady(true);
        } catch (e) {
          setError(String(e?.message || e));
        }
      },
    }),
    [importXml]
  );

  useImperativeHandle(ref, () => api, [api]);

  useEffect(() => {
    let alive = true;

    async function boot() {
      setReady(false);
      setError("");

      if (!enabled || !containerRef.current) return;

      const viewer = new NavigatedViewer({ container: containerRef.current });
      viewerRef.current = viewer;

      try {
        await importXml(true);
        if (!alive) return;

        setReady(true);

        const eventBus = viewer.get("eventBus");

        const onClick = (e) => {
          if (!alive) return;
          const el = e?.element || null;
          if (!el) return;

          if (typeof onElementClick === "function") {
            if (!isCopilotTarget(el)) return;
            onElementClick(el);
          }
        };

        const onVB = () => {
          if (!alive) return;
          if (typeof onViewportChange === "function") onViewportChange();
        };

        const onCanvas = () => {
          if (!alive) return;
          if (typeof onBackgroundClick === "function") onBackgroundClick();
        };

        eventBus.on("element.click", onClick);
        eventBus.on("canvas.viewbox.changed", onVB);
        try {
          eventBus.on("canvas.click", onCanvas);
        } catch {}
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
      }
    }

    boot();

    return () => {
      alive = false;
      try {
        viewerRef.current?.destroy();
      } catch {}
      viewerRef.current = null;
    };
  }, [sessionId, enabled, onElementClick, onViewportChange, onBackgroundClick, importXml]);

  useEffect(() => {
    const onSaved = () => {
      api.reload().catch(() => {});
    };
    window.addEventListener("fpc:graph-saved", onSaved);
    return () => window.removeEventListener("fpc:graph-saved", onSaved);
  }, [api]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <GraphEditorOverlay sessionId={sessionId} />
      {enabled && !ready && !error ? (
        <div style={{ position: "absolute", left: 12, bottom: 12 }} className="card">
          <div className="small muted">Loading BPMN…</div>
        </div>
      ) : null}
      {enabled && error ? (
        <div style={{ position: "absolute", left: 12, bottom: 12 }} className="card">
          <div style={{ fontWeight: 900, marginBottom: 6 }}>BPMN import error</div>
          <div className="small muted">{error}</div>
        </div>
      ) : null}
    </div>
  );
});
