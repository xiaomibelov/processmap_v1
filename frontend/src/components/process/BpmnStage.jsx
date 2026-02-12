import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import BpmnJS from "bpmn-js/dist/bpmn-viewer.production.min.js";
import { apiGetBpmn } from "../../lib/api";

const BpmnStage = forwardRef(function BpmnStage({ sessionId, xml, onElementClick }, ref) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    zoomIn() {
      const v = viewerRef.current; if (!v) return;
      const c = v.get("canvas"); c.zoom(c.zoom() + 0.2);
    },
    zoomOut() {
      const v = viewerRef.current; if (!v) return;
      const c = v.get("canvas"); c.zoom(Math.max(0.2, c.zoom() - 0.2));
    },
    fit() {
      const v = viewerRef.current; if (!v) return;
      v.get("canvas").zoom("fit-viewport");
    },
  }));

  useEffect(() => {
    if (!hostRef.current) return;
    const viewer = new BpmnJS({ container: hostRef.current });
    viewerRef.current = viewer;

    const eventBus = viewer.get("eventBus");
    eventBus.on("element.click", (e) => {
      const el = e?.element;
      if (!el) return;
      if (el.type === "label" || el.id === "__implicitroot") return;
      onElementClick?.(el);
    });

    return () => {
      try { viewer.destroy(); } catch {}
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    async function load() {
      if (!sessionId || String(sessionId).startsWith("local_")) return;
      const r = await apiGetBpmn(sessionId);
      if (r.ok && r.text) {
        await v.importXML(r.text);
        v.get("canvas").zoom("fit-viewport");
      }
    }
    load();
  }, [sessionId]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !xml) return;
    async function loadXml() {
      await v.importXML(xml);
      v.get("canvas").zoom("fit-viewport");
    }
    loadXml();
  }, [xml]);

  return (
    <div className="bpmnWrap">
      <div ref={hostRef} className="bpmnHost" style={{ height: "100%" }} />
    </div>
  );
});

export default BpmnStage;
