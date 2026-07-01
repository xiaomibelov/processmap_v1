import { useEffect, useRef, useState } from "react";
import pmModdleDescriptor from "../../robotmeta/pmModdleDescriptor";
import camundaModdleDescriptor from "../../camunda/camundaModdleDescriptor";

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n === 0) return "0 B";
  const kb = n / 1024;
  return `${kb < 1 ? n.toFixed(0) : kb.toFixed(1)} ${kb < 1 ? "B" : "KB"}`;
}

export default function BpmnVersionPreview({
  xml,
  label,
  size,
  onDownload,
  downloadLabel = "Скачать .bpmn",
  compact = false,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");
  const [showXml, setShowXml] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let viewer = null;

    async function render() {
      if (!containerRef.current) return;
      const xmlText = String(xml || "").trim();
      if (!xmlText) {
        setStatus("idle");
        return;
      }
      setStatus("loading");
      setError("");

      try {
        if (!viewerRef.current) {
          const mod = await import("bpmn-js/lib/NavigatedViewer");
          const Viewer = mod.default || mod.NavigatedViewer || mod;
          viewer = new Viewer({
            container: containerRef.current,
            moddleExtensions: { pm: pmModdleDescriptor, camunda: camundaModdleDescriptor },
          });
          if (cancelled) {
            try {
              viewer.destroy();
            } catch {}
            return;
          }
          viewerRef.current = viewer;
        } else {
          viewer = viewerRef.current;
        }
        if (cancelled) return;
        await viewer.importXML(xmlText);
        if (cancelled) return;
        viewer.get("canvas").zoom("fit-viewport");
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(String(err?.message || err || "Не удалось загрузить версию. XML повреждён или невалиден."));
      }
    }

    render();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        try { viewerRef.current.destroy(); } catch {}
        viewerRef.current = null;
      }
    };
  }, [xml]);

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-border bg-panel2/35 ${compact ? "min-h-0 h-full" : "min-h-[320px]"}`}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-xs text-muted">
          {label ? `Предпросмотр · ${label}` : "Выберите версию слева"}
        </div>
        <div className="flex items-center gap-2">
          {size ? <span className="text-[11px] text-muted">{formatBytes(size)}</span> : null}
          <button
            type="button"
            className="text-[11px] text-accent hover:underline"
            onClick={() => setShowXml((prev) => !prev)}
          >
            {showXml ? "Скрыть XML" : "XML"}
          </button>
        </div>
      </div>

      <div className="relative min-h-[200px] flex-1 bg-panel">
        {status === "loading" ? (
          <div className="grid h-full place-items-center" data-testid="bpmn-version-preview-loading">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          </div>
        ) : status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center" data-testid="bpmn-version-preview-error">
            <div className="text-sm text-danger">{error}</div>
            <button type="button" className="secondaryBtn h-8 px-2 text-xs" onClick={onDownload}>
              Скачать XML для диагностики
            </button>
          </div>
        ) : status === "ready" || status === "idle" ? (
          <div ref={containerRef} className="h-full w-full" data-testid="bpmn-version-preview-canvas" />
        ) : null}
      </div>

      {showXml ? (
        <div className="border-t border-border p-2">
          <textarea
            className="xmlEditorTextarea h-40 w-full text-xs"
            value={String(xml || "")}
            readOnly
            data-testid="bpmn-version-preview-xml"
          />
        </div>
      ) : null}
    </div>
  );
}
