import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import BpmnJS from "bpmn-js/lib/NavigatedViewer";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

function buildFallbackBpmn() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт" />
    <bpmn:endEvent id="EndEvent_1" name="Финиш" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="240" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="420" y="240" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="258"/>
        <di:waypoint x="420" y="258"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

const BpmnStage = forwardRef(function BpmnStage({ sessionId, reloadKey = 0 }, ref) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const [err, setErr] = useState("");

  const fallbackXml = useMemo(() => buildFallbackBpmn(), []);

  useImperativeHandle(ref, () => ({
    zoomIn() {
      const v = viewerRef.current;
      if (!v) return;
      const canvas = v.get("canvas");
      const z = canvas.zoom();
      canvas.zoom(z + 0.2);
    },
    zoomOut() {
      const v = viewerRef.current;
      if (!v) return;
      const canvas = v.get("canvas");
      const z = canvas.zoom();
      canvas.zoom(Math.max(0.2, z - 0.2));
    },
    fit() {
      const v = viewerRef.current;
      if (!v) return;
      const canvas = v.get("canvas");
      canvas.zoom("fit-viewport");
    },
  }));

  useEffect(() => {
    if (!hostRef.current) return;

    const v = new BpmnJS({
      container: hostRef.current,
    });
    viewerRef.current = v;

    return () => {
      try { v.destroy(); } catch (_) {}
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const v = viewerRef.current;
      if (!v) return;

      setErr("");

      try {
        let xml = fallbackXml;

        if (sessionId && !isLocalSessionId(sessionId)) {
          const id = encodeURIComponent(sessionId);
          const res = await fetch(`/api/sessions/${id}/bpmn`, { credentials: "include" });
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            throw new Error(`BPMN: ${res.status} ${t}`);
          }
          xml = await res.text();
        }

        await v.importXML(xml);
        v.get("canvas").zoom("fit-viewport");
      } catch (e) {
        if (cancelled) return;
        setErr(String(e?.message || e));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId, reloadKey, fallbackXml]);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div ref={hostRef} className="bpmnHost" style={{ height: "100%" }} />
      {err ? (
        <div className="panel" style={{ position: "absolute", left: 14, bottom: 14, width: 420, padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Ошибка</div>
          <div className="small muted">Ошибка импорта BPMN. Проверь данные сессии и экспорт.</div>
          <div className="small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{err}</div>
        </div>
      ) : null}
    </div>
  );
});

export default BpmnStage;
