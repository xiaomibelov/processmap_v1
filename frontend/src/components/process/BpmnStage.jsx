import { useEffect, useRef, useState } from "react";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

// Минимальная "пустая" диаграмма (не демо процесса): старт → финиш.
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

export default function BpmnStage({ sessionId }) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function importXml(xml) {
    const viewer = viewerRef.current;
    if (!viewer) return;

    try {
      setError("");
      await viewer.importXML(xml || EMPTY_BPMN_XML);
      const canvas = viewer.get("canvas");
      canvas.zoom("fit-viewport");
    } catch (e) {
      setError("Ошибка импорта BPMN. Проверь данные сессии и экспорт.");
    }
  }

  async function loadBpmn() {
    const id = typeof sessionId === "string" ? sessionId : "";

    if (!id) {
      setStatus("Нет активной сессии");
      await importXml(EMPTY_BPMN_XML);
      return;
    }

    if (isLocalSessionId(id)) {
      setStatus("Локальная сессия: BPMN с сервера недоступен. Создай “Новая (API)”.");
      await importXml(EMPTY_BPMN_XML);
      return;
    }

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
  }

  function zoomIn() {
    const v = viewerRef.current;
    if (!v) return;
    const c = v.get("canvas");
    const z = c.zoom();
    c.zoom(z + 0.2);
  }

  function zoomOut() {
    const v = viewerRef.current;
    if (!v) return;
    const c = v.get("canvas");
    const z = c.zoom();
    c.zoom(Math.max(0.2, z - 0.2));
  }

  function fit() {
    const v = viewerRef.current;
    if (!v) return;
    const c = v.get("canvas");
    c.zoom("fit-viewport");
  }

  useEffect(() => {
    if (!hostRef.current) return;

    viewerRef.current = new NavigatedViewer({ container: hostRef.current });

    loadBpmn();

    const onSaved = () => loadBpmn();
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
    loadBpmn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", right: 12, top: 10, zIndex: 5, display: "flex", gap: 8 }}>
        <button className="ghostBtn" onClick={zoomOut} title="Уменьшить">
          −
        </button>
        <button className="ghostBtn" onClick={zoomIn} title="Увеличить">
          +
        </button>
        <button className="ghostBtn" onClick={fit} title="Вписать">
          Вписать
        </button>
      </div>

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
}
