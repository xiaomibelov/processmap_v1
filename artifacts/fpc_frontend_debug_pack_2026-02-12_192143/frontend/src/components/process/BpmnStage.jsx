import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import BpmnJS from "bpmn-js/lib/NavigatedViewer";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function buildFallbackBpmn() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/2001/XMLSchema-instance"
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

const BpmnStage = forwardRef(function BpmnStage(
  { sessionId, reloadKey = 0, aiEnabled = false, questions = [], selectedNodeId = "", onElementClick = null },
  ref
) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState("");

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

  const syncBadges = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let overlays = null;
    let registry = null;
    try {
      overlays = viewer.get("overlays");
      registry = viewer.get("elementRegistry");
    } catch (_) {
      return;
    }
    if (!overlays || !registry) return;

    try {
      overlays.clear();
    } catch (_) {}

    if (!aiEnabled) return;

    const qs = Array.isArray(questions) ? questions : [];
    if (!qs.length) return;

    const els = registry.filter((el) => {
      const t = el?.type || "";
      return t === "bpmn:Task" || t === "bpmn:UserTask" || t === "bpmn:ServiceTask";
    });

    for (const el of els) {
      const open = qs.filter((q) => q && q.node_id === el.id && q.state !== "done");
      if (!open.length) continue;

      const root = document.createElement("div");
      root.className = "bpmnBadge";
      root.textContent = `AI ${open.length}`;

      overlays.add(el, "note", {
        position: { top: 6, right: 6 },
        html: root,
      });
    }
  }, [aiEnabled, questions]);

  useEffect(() => {
    if (!hostRef.current) return;

    const v = new BpmnJS({ container: hostRef.current });
    viewerRef.current = v;

    const handleClick = (event) => {
      if (typeof onElementClick !== "function") return;
      onElementClick(event);
    };

    try {
      v.on("element.click", handleClick);
    } catch (_) {}

    return () => {
      try {
        v.destroy();
      } catch (_) {}
      viewerRef.current = null;
    };
  }, [onElementClick]);

  useEffect(() => {
    let cancelled = false;

    async function tryFetchXml(url) {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, status: res.status, text: t };
      }
      const xml = await res.text();
      return { ok: true, xml };
    }

    async function load() {
      const v = viewerRef.current;
      if (!v) return;

      setStatus("");

      try {
        let xml = fallbackXml;

        if (sessionId && !isLocalSessionId(sessionId)) {
          const id = encodeURIComponent(sessionId);

          // IMPORTANT: DO NOT use trailing slash here.
          // Backend redirects /bpmn/ -> other origin/port (e.g. :8011), which breaks cookies/CORS.
          const url = `/api/sessions/${id}/bpmn`;

          const r = await tryFetchXml(url);
          if (!r.ok) {
            throw new Error(`BPMN: ${r.status} ${String(r.text || "").slice(0, 180)}`.trim());
          }
          xml = r.xml;
        }

        await v.importXML(xml);
        v.get("canvas").zoom("fit-viewport");

        if (!cancelled) syncBadges();
      } catch (e) {
        if (cancelled) return;
        setStatus(String(e?.message || e));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadKey, fallbackXml, syncBadges]);

  useEffect(() => {
    syncBadges();
  }, [syncBadges]);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div className="bpmnStage" ref={hostRef} />
      {status ? (
        <div className="panel" style={{ position: "absolute", left: 14, bottom: 14, width: 460, padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Ошибка BPMN</div>
          <div className="small muted">Импорт BPMN не удался. Проверь /api/sessions/&lt;id&gt;/bpmn.</div>
          <div className="small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
            {status}
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default BpmnStage;
