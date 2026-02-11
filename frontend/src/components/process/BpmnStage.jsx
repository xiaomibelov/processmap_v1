import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

// Минимальная диаграмма: старт → финиш.
// Нужна, чтобы viewer не падал с "no diagram to display".
const EMPTY_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_Empty" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт"/>
    <bpmn:endEvent id="EndEvent_1" name="Финиш"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="360" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="178" />
        <di:waypoint x="360" y="178" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const BpmnStage = forwardRef(function BpmnStage({ sessionId }, ref) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const queueRef = useRef(Promise.resolve());

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function getCanvas() {
    const v = viewerRef.current;
    if (!v) return null;
    try {
      return v.get("canvas");
    } catch {
      return null;
    }
  }

  function zoomIn() {
    const c = getCanvas();
    if (!c) return;
    const z = c.zoom();
    c.zoom(z + 0.2);
  }

  function zoomOut() {
    const c = getCanvas();
    if (!c) return;
    const z = c.zoom();
    c.zoom(Math.max(0.2, z - 0.2));
  }

  function fit() {
    const c = getCanvas();
    if (!c) return;
    c.zoom("fit-viewport");
  }

  async function importXml(xml) {
    const v = viewerRef.current;
    if (!v) return;
    try {
      setError("");
      await v.importXML(xml || EMPTY_BPMN_XML);
      fit();
    } catch {
      setError("Ошибка импорта BPMN. Проверь данные сессии и экспорт.");
    }
  }

  function enqueue(task) {
    queueRef.current = queueRef.current.then(task).catch(() => {});
    return queueRef.current;
  }

  function reload() {
    const id = typeof sessionId === "string" ? sessionId : "";
    return enqueue(async () => {
      if (!viewerRef.current) return;

      if (!id) {
        setError("");
        setStatus("Нет активной сессии");
        await importXml(EMPTY_BPMN_XML);
        return;
      }

      if (isLocalSessionId(id)) {
        setError("");
        setStatus("Локальная сессия: для реального BPMN создай “Новая (API)”.");
        await importXml(EMPTY_BPMN_XML);
        return;
      }

      setError("");
      setStatus("Загрузка BPMN…");

      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/bpmn`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          setStatus("BPMN недоступен");
          await importXml(EMPTY_BPMN_XML);
          return;
        }

        const xml = await res.text();
        setStatus("");
        await importXml(xml || EMPTY_BPMN_XML);
      } catch {
        setStatus("Ошибка сети при загрузке BPMN");
        await importXml(EMPTY_BPMN_XML);
      }
    });
  }

  useImperativeHandle(
    ref,
    () => ({
      zoomIn,
      zoomOut,
      fit,
      reload,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId]
  );

  useEffect(() => {
    if (!hostRef.current) return;

    viewerRef.current = new NavigatedViewer({ container: hostRef.current });

    const onSaved = () => reload();
    window.addEventListener("fpc:graph-saved", onSaved);

    return () => {
      window.removeEventListener("fpc:graph-saved", onSaved);
      try {
        viewerRef.current && viewerRef.current.destroy();
      } catch {
        // ignore
      }
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={hostRef} style={{ width: "100%", height: "100%", background: "#fff" }} />

      {status ? (
        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 6, maxWidth: 520 }}>
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 4 }}>Статус</div>
            <div className="small muted">{status}</div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 7, maxWidth: 520 }}>
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 4 }}>Ошибка</div>
            <div className="small muted">{error}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default BpmnStage;
