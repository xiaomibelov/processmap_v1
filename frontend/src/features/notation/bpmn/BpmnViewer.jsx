import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { loadBpmnJs } from "./loadBpmnJs";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.0;

const BpmnViewer = forwardRef(function BpmnViewer({ xml, className = "" }, ref) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);

  const [engine, setEngine] = useState("init"); // init|ready|fail
  const [err, setErr] = useState("");

  useImperativeHandle(
    ref,
    () => ({
      async setXml(nextXml) {
        await importXml(nextXml);
      },
      fit() {
        try {
          const v = viewerRef.current;
          if (!v) return;
          const canvas = v.get("canvas");
          canvas.zoom("fit-viewport");
        } catch {}
      },
      zoomIn() {
        try {
          const v = viewerRef.current;
          if (!v) return;
          const canvas = v.get("canvas");
          const z = canvas.zoom();
          canvas.zoom(clamp(z + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
        } catch {}
      },
      zoomOut() {
        try {
          const v = viewerRef.current;
          if (!v) return;
          const canvas = v.get("canvas");
          const z = canvas.zoom();
          canvas.zoom(clamp(z - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
        } catch {}
      },
    }),
    []
  );

  async function ensureViewer() {
    if (viewerRef.current) return viewerRef.current;

    const BpmnJS = await loadBpmnJs();
    const v = new BpmnJS({
      container: hostRef.current,
    });

    viewerRef.current = v;
    setEngine("ready");
    return v;
  }

  async function importXml(nextXml) {
    const x = String(nextXml || "").trim();
    if (!x) return;

    try {
      setErr("");
      const v = await ensureViewer();
      await v.importXML(x);

      try {
        const canvas = v.get("canvas");
        canvas.zoom("fit-viewport");
      } catch {}
    } catch (e) {
      setErr(String(e?.message || e));
      setEngine("fail");
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await ensureViewer();
        if (!alive) return;
        if (xml) await importXml(xml);
      } catch (e) {
        if (!alive) return;
        setEngine("fail");
        setErr(String(e?.message || e));
      }
    })();

    return () => {
      alive = false;
      try {
        viewerRef.current?.destroy?.();
      } catch {}
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!xml) return;
    importXml(xml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xml]);

  if (engine === "fail") {
    return (
      <div className={`bpmnViewerFallback ${className}`}>
        <div className="bpmnHint">
          BPMN viewer не загрузился (CDN). Показываю XML.
          {err ? <span className="badge err" style={{ marginLeft: 10 }}>{err}</span> : null}
        </div>
        <pre className="bpmnPre">{String(xml || "")}</pre>
      </div>
    );
  }

  return (
    <div className={`bpmnViewer ${className}`}>
      {engine === "init" ? <div className="bpmnHint">loading viewer…</div> : null}
      {err ? <div className="badge err" style={{ marginBottom: 10 }}>{err}</div> : null}
      <div ref={hostRef} className="bpmnHost" />
    </div>
  );
});

export default BpmnViewer;
