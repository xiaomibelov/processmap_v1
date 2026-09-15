import { useEffect, useRef, useState } from "react";
import pmModdleDescriptor from "../../robotmeta/pmModdleDescriptor";
import camundaModdleDescriptor from "../../camunda/camundaModdleDescriptor";
import zeebeModdleDescriptor from "../../camunda/zeebeModdleDescriptor";
import "./bpmn-version-preview.theme.css";

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n || n <= 0) return null;
  const kb = n / 1024;
  return `${kb < 1 ? n.toFixed(0) : kb.toFixed(1)} ${kb < 1 ? "B" : "KB"}`;
}

function Skeleton() {
  return (
    <div className="flex h-full w-full flex-col gap-3 p-4" data-testid="bpmn-version-preview-skeleton">
      <div className="h-4 w-1/3 rounded bg-fg/10" />
      <div className="flex-1 rounded-lg bg-fg/5" />
      <div className="h-3 w-1/2 rounded bg-fg/10" />
    </div>
  );
}

const HIGHLIGHT_KINDS = new Set(["added", "removed", "changed", "moved", "resized"]);

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}

async function waitForNonZeroSize(element, attempts = 12) {
  for (let i = 0; i < attempts; i += 1) {
    const rect = element.getBoundingClientRect();
    if (rect.width >= 2 && rect.height >= 2) return true;
    await nextFrame();
  }
  return false;
}

export default function BpmnVersionPreview({
  xml,
  label,
  size,
  onDownload,
  downloadLabel = "Скачать .bpmn",
  compact = false,
  showXml: showXmlProp,
  onToggleXml,
  highlights,
  onViewerReady,
  onViewerGone,
  markerPrefix = "vcc",
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const appliedMarkersRef = useRef([]);
  const onViewerReadyRef = useRef(onViewerReady);
  const onViewerGoneRef = useRef(onViewerGone);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");
  const [showXmlInternal, setShowXmlInternal] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const isControlled = showXmlProp !== undefined;
  const showXml = isControlled ? showXmlProp : showXmlInternal;
  const setShowXml = (value) => {
    if (isControlled) {
      onToggleXml?.(value);
    } else {
      setShowXmlInternal(value);
    }
  };

  useEffect(() => {
    onViewerReadyRef.current = onViewerReady;
  }, [onViewerReady]);

  useEffect(() => {
    onViewerGoneRef.current = onViewerGone;
  }, [onViewerGone]);

  useEffect(() => {
    let cancelled = false;
    let viewer = null;
    let skeletonTimer = null;

    async function render() {
      if (!containerRef.current) return;
      const xmlText = String(xml || "").trim();
      if (!xmlText) {
        setStatus("idle");
        setShowSkeleton(false);
        return;
      }
      setStatus("loading");
      setError("");
      skeletonTimer = window.setTimeout(() => {
        if (!cancelled) setShowSkeleton(true);
      }, 3000);

      try {
        // Guard SVGMatrix: не создаём viewer в контейнере с нулевым размером.
        const hasSize = await waitForNonZeroSize(containerRef.current);
        if (cancelled) return;
        if (!hasSize) {
          throw new Error("Контейнер превью имеет нулевой размер. Панель ещё не развернута.");
        }
        if (!viewerRef.current) {
          const mod = await import("bpmn-js/lib/NavigatedViewer");
          const Viewer = mod.default || mod.NavigatedViewer || mod;
          viewer = new Viewer({
            container: containerRef.current,
            moddleExtensions: { pm: pmModdleDescriptor, camunda: camundaModdleDescriptor, zeebe: zeebeModdleDescriptor },
          });
          if (cancelled) {
            try { viewer.destroy(); } catch {}
            return;
          }
          viewerRef.current = viewer;
        } else {
          viewer = viewerRef.current;
        }
        if (cancelled) return;
        await viewer.importXML(xmlText);
        if (cancelled) return;
        const canvas = viewer.get("canvas");
        canvas.zoom("fit-viewport");
        if (!cancelled) {
          setStatus("ready");
          setShowSkeleton(false);
          onViewerReadyRef.current?.(viewer);
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        const raw = String(err?.message || err || "");
        const isNetworkError = err instanceof TypeError || /failed to fetch|networkerror/i.test(raw);
        setError(isNetworkError
          ? "Не удалось загрузить версию: сеть недоступна или сервер не ответил. Повторите попытку."
          : (raw || "Не удалось загрузить версию. XML повреждён или невалиден."));
        setShowSkeleton(false);
      } finally {
        if (skeletonTimer) window.clearTimeout(skeletonTimer);
      }
    }

    render();

    return () => {
      cancelled = true;
      if (skeletonTimer) window.clearTimeout(skeletonTimer);
      appliedMarkersRef.current = [];
      if (viewerRef.current) {
        try { viewerRef.current.destroy(); } catch {}
        viewerRef.current = null;
      }
      onViewerGoneRef.current?.();
    };
  }, [xml]);

  useEffect(() => {
    if (status !== "ready") return undefined;
    const viewer = viewerRef.current;
    if (!viewer) return undefined;
    let canvas = null;
    try { canvas = viewer.get("canvas"); } catch { canvas = null; }
    if (!canvas) return undefined;

    const previous = appliedMarkersRef.current;
    previous.forEach(({ id, cls }) => {
      try { canvas.removeMarker(id, cls); } catch {}
    });

    const applied = [];
    Object.entries(highlights || {}).forEach(([rawId, kindRaw]) => {
      const id = String(rawId || "").trim();
      const kind = String(kindRaw || "").trim();
      if (!id || !HIGHLIGHT_KINDS.has(kind)) return;
      const cls = `${markerPrefix}-${kind}`;
      try {
        canvas.addMarker(id, cls);
        applied.push({ id, cls });
      } catch {
        // Элемента нет в этой версии диаграммы — пропускаем молча.
      }
    });
    appliedMarkersRef.current = applied;

    return () => {
      applied.forEach(({ id, cls }) => {
        try { canvas.removeMarker(id, cls); } catch {}
      });
    };
  }, [status, highlights, markerPrefix]);

  const sizeLabel = formatBytes(size);

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-border bg-panel2/35 ${compact ? "h-full" : "min-h-[320px] h-full"}`}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-xs text-muted">
          {label ? `Предпросмотр · ${label}` : "Выберите версию слева"}
        </div>
        <div className="flex items-center gap-3">
          {sizeLabel ? <span className="text-[11px] text-muted">{sizeLabel}</span> : null}
          <button
            type="button"
            className="text-[11px] text-accent hover:underline"
            onClick={() => setShowXml(!showXml)}
            data-testid="bpmn-version-preview-toggle-xml"
          >
            {showXml ? "Скрыть XML" : "XML"}
          </button>
        </div>
      </div>

      <div className="relative min-h-[320px] flex-1 bg-panel">
        <div
          ref={containerRef}
          className="bpmnVersionPreview h-full min-h-[320px] w-full"
          data-testid="bpmn-version-preview-canvas"
        />
        {status === "idle" ? (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted" data-testid="bpmn-version-preview-idle">
            Выберите версию слева, чтобы увидеть диаграмму
          </div>
        ) : status === "loading" && showSkeleton ? (
          <div className="absolute inset-0 bg-panel/90">
            <Skeleton />
          </div>
        ) : status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center bg-panel/90" data-testid="bpmn-version-preview-error">
            <div className="text-sm text-danger">{error}</div>
            <button type="button" className="secondaryBtn h-8 px-2 text-xs" onClick={onDownload}>
              Скачать XML для диагностики
            </button>
          </div>
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
