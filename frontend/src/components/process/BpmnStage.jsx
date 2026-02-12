import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import BpmnJS from "bpmn-js/lib/NavigatedViewer";
import { apiGetBpmn } from "../../lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

const LOCAL_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
 xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
 xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
 xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
 id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт"/>
    <bpmn:task id="n_demo_1" name="Шаг (пример)"/>
    <bpmn:endEvent id="EndEvent_1" name="Конец"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="n_demo_1"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="n_demo_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="200" y="140" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="n_demo_1">
        <dc:Bounds x="300" y="120" width="160" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="500" y="140" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="236" y="158"/>
        <di:waypoint x="300" y="160"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="460" y="160"/>
        <di:waypoint x="500" y="158"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

function isFlowNode(el) {
  const t = el?.type || "";
  return (
    t === "bpmn:Task" ||
    t === "bpmn:UserTask" ||
    t === "bpmn:ManualTask" ||
    t === "bpmn:ServiceTask" ||
    t === "bpmn:ScriptTask" ||
    t === "bpmn:BusinessRuleTask" ||
    t === "bpmn:SendTask" ||
    t === "bpmn:ReceiveTask" ||
    t === "bpmn:CallActivity" ||
    t === "bpmn:SubProcess"
  );
}

const BpmnStage = forwardRef(function BpmnStage(
  { sessionId, reloadKey = 0, aiEnabled = true, questions = [], selectedNodeId = "", onElementClick },
  ref
) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const overlayIdsRef = useRef([]);
  const [ready, setReady] = useState(false);

  const openCountByNodeId = useMemo(() => {
    const map = new Map();
    (questions || []).forEach((q) => {
      const nodeId = q?.node_id;
      if (!nodeId) return;
      const st = q?.status || "open";
      const isOpen = st !== "answered" && st !== "skipped";
      if (!isOpen) return;
      map.set(nodeId, (map.get(nodeId) || 0) + 1);
    });
    return map;
  }, [questions]);

  useImperativeHandle(ref, () => ({
    zoomIn() {
      const v = viewerRef.current;
      if (!v) return;
      const canvas = v.get("canvas");
      const z = canvas.zoom() || 1;
      canvas.zoom(z * 1.15);
    },
    zoomOut() {
      const v = viewerRef.current;
      if (!v) return;
      const canvas = v.get("canvas");
      const z = canvas.zoom() || 1;
      canvas.zoom(z / 1.15);
    },
    fit() {
      const v = viewerRef.current;
      if (!v) return;
      v.get("canvas").zoom("fit-viewport");
    },
  }));

  // init viewer once
  useEffect(() => {
    if (!hostRef.current) return;

    const viewer = new BpmnJS({ container: hostRef.current });
    viewerRef.current = viewer;

    viewer.on("element.click", (e) => {
      const el = e?.element;
      if (!el || !isFlowNode(el)) return;
      onElementClick?.(e);
    });

    return () => {
      try {
        viewer.destroy();
      } catch {}
      viewerRef.current = null;
    };
  }, [onElementClick]);

  // import XML when sessionId/reloadKey changes
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;

    let cancelled = false;
    setReady(false);

    async function run() {
      try {
        const xml = !sessionId
          ? LOCAL_BPMN_XML
          : isLocalSessionId(sessionId)
          ? LOCAL_BPMN_XML
          : await apiGetBpmn(sessionId);

        if (cancelled) return;

        await v.importXML(xml);
        v.get("canvas").zoom("fit-viewport");
        setReady(true);
      } catch (err) {
        console.warn("bpmn import failed:", err);
        setReady(true);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadKey]);

  // overlays: AI badges + selected marker
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !ready) return;

    const overlays = v.get("overlays");
    const elementRegistry = v.get("elementRegistry");
    const canvas = v.get("canvas");

    // cleanup old overlays
    overlayIdsRef.current.forEach((id) => {
      try {
        overlays.remove(id);
      } catch {}
    });
    overlayIdsRef.current = [];

    // markers
    try {
      canvas.removeMarker(selectedNodeId, "is-selected");
    } catch {}
    if (selectedNodeId) {
      try {
        canvas.addMarker(selectedNodeId, "is-selected");
      } catch {}
    }

    if (!aiEnabled) return;

    const elements = elementRegistry.getAll().filter(isFlowNode);

    elements.forEach((el) => {
      const count = openCountByNodeId.get(el.id) || 0;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bpmnAiBadge";
      btn.textContent = count > 0 ? `AI ${count}` : "AI";
      btn.title = count > 0 ? `Открытых вопросов: ${count}` : "AI Copilot";
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onElementClick?.({ element: el });
      });

      try {
        const oid = overlays.add(el.id, { position: { top: -10, right: -10 }, html: btn });
        overlayIdsRef.current.push(oid);
      } catch {}
    });
  }, [ready, aiEnabled, openCountByNodeId, selectedNodeId, onElementClick]);

  return <div className="bpmnStage" ref={hostRef} />;
});

export default BpmnStage;
