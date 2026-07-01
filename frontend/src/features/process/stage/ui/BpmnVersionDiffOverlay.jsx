import { useEffect, useRef, useState, useMemo } from "react";
import pmModdleDescriptor from "../../robotmeta/pmModdleDescriptor";
import camundaModdleDescriptor from "../../camunda/camundaModdleDescriptor";
import BpmnVersionPreview from "./BpmnVersionPreview";

const BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";

const INTERESTING_LOCAL_NAMES = new Set([
  "task", "userTask", "serviceTask", "sendTask", "receiveTask", "manualTask",
  "businessRuleTask", "scriptTask",
  "exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway", "complexGateway",
  "startEvent", "endEvent", "intermediateThrowEvent", "intermediateCatchEvent", "boundaryEvent",
  "subProcess", "callActivity", "adHocSubProcess",
  "sequenceFlow", "messageFlow", "association",
  "participant", "lane", "laneSet",
  "dataObjectReference", "dataStoreReference",
  "group", "textAnnotation",
]);

function parseBpmnIndex(xmlText) {
  const map = new Map();
  if (!xmlText) return map;
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) return map;
  const all = doc.getElementsByTagNameNS(BPMN_NS, "*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const local = el.localName;
    if (!INTERESTING_LOCAL_NAMES.has(local)) continue;
    const id = el.getAttribute("id");
    if (!id) continue;
    const name = String(el.getAttribute("name") || "").trim();
    map.set(id, { id, type: local, name });
  }
  return map;
}

function computeDiff(previousXml, nextXml) {
  const previous = parseBpmnIndex(previousXml);
  const next = parseBpmnIndex(nextXml);
  const added = [];
  const removed = [];
  const changed = [];

  next.forEach((nItem) => {
    const pItem = previous.get(nItem.id);
    if (!pItem) {
      added.push(nItem);
    } else if (pItem.type !== nItem.type || pItem.name !== nItem.name) {
      changed.push({ ...nItem, previousName: pItem.name, previousType: pItem.type });
    }
  });

  previous.forEach((pItem) => {
    if (!next.has(pItem.id)) removed.push(pItem);
  });

  return { added, removed, changed };
}

function classForDiff(kind) {
  if (kind === "added") return "bg-emerald-500 text-white";
  if (kind === "removed") return "bg-rose-500 text-white";
  return "bg-amber-500 text-white";
}

export default function BpmnVersionDiffOverlay({
  previousXml,
  nextXml,
  previousLabel = "Версия А",
  nextLabel = "Версия Б",
  onClose,
}) {
  const mainRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [badgeSummary, setBadgeSummary] = useState({ added: 0, changed: 0 });

  const diff = useMemo(
    () => computeDiff(previousXml, nextXml),
    [previousXml, nextXml]
  );

  useEffect(() => {
    let cancelled = false;
    let viewer = null;
    let overlays = null;

    async function render() {
      if (!mainRef.current) return;
      const xmlText = String(nextXml || "").trim();
      if (!xmlText) {
        setStatus("idle");
        return;
      }
      setStatus("loading");
      setError("");
      setBadgeSummary({ added: 0, changed: 0 });

      try {
        if (!viewerRef.current) {
          const mod = await import("bpmn-js/lib/NavigatedViewer");
          const Viewer = mod.default || mod.NavigatedViewer || mod;
          viewer = new Viewer({
            container: mainRef.current,
            moddleExtensions: { pm: pmModdleDescriptor, camunda: camundaModdleDescriptor },
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

        overlays = viewer.get("overlays");
        let addedCount = 0;
        let changedCount = 0;

        diff.added.forEach(({ id, type, name }) => {
          try {
            overlays.add(id, {
              position: { top: -10, left: -10 },
              html: `<div class="pointer-events-none rounded-full ${classForDiff("added")} h-5 w-5 flex items-center justify-center text-[10px] font-bold shadow" title="Добавлено: ${name || type} (${id})">+</div>`,
            });
            addedCount += 1;
          } catch {}
        });

        diff.changed.forEach(({ id, type, name, previousName }) => {
          try {
            overlays.add(id, {
              position: { top: -10, left: -10 },
              html: `<div class="pointer-events-none rounded-full ${classForDiff("changed")} h-5 w-5 flex items-center justify-center text-[10px] font-bold shadow" title="Изменено: ${previousName || ""} → ${name || type} (${id})">Δ</div>`,
            });
            changedCount += 1;
          } catch {}
        });

        if (!cancelled) {
          setBadgeSummary({ added: addedCount, changed: changedCount });
          setStatus("ready");
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(String(err?.message || err || "Не удалось загрузить сравниваемую версию."));
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
  }, [nextXml, diff]);

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-border bg-panel2/35" data-testid="bpmn-diff-overlay">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm font-semibold text-fg">Сравнение версий</div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600">+{diff.added.length}</span>
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-600">−{diff.removed.length}</span>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600">Δ{diff.changed.length}</span>
          {onClose ? (
            <button type="button" className="secondaryBtn ml-2 h-7 px-2 text-[11px]" onClick={onClose}>
              Закрыть
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid h-full min-h-0 flex-1 grid-cols-[220px_1fr] gap-3 p-3">
        <div className="flex h-full flex-col gap-2 overflow-hidden">
          <div className="h-1/2 overflow-hidden">
            <BpmnVersionPreview xml={previousXml} label={previousLabel} size={previousXml?.length} compact />
          </div>
          <div className="h-1/2 overflow-hidden">
            <BpmnVersionPreview xml={nextXml} label={nextLabel} size={nextXml?.length} compact />
          </div>
        </div>

        <div className="relative h-full min-h-[200px] overflow-hidden rounded-lg border border-border bg-panel">
          <div ref={mainRef} className="h-full min-h-[200px] w-full" data-testid="bpmn-diff-overlay-canvas" />
          {status === "loading" ? (
            <div className="absolute inset-0 grid place-items-center bg-panel/80" data-testid="bpmn-diff-overlay-loading">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            </div>
          ) : status === "error" ? (
            <div className="absolute inset-0 grid place-items-center px-4 text-center bg-panel/90" data-testid="bpmn-diff-overlay-error">
              <div className="text-sm text-danger">{error}</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid max-h-[140px] grid-cols-3 gap-2 overflow-auto border-t border-border px-3 py-2 text-xs">
        <div>
          <div className="mb-1 font-semibold text-emerald-600">Добавлено ({diff.added.length})</div>
          <ul className="space-y-0.5 text-muted">
            {diff.added.slice(0, 20).map((x) => (
              <li key={x.id} className="truncate" title={x.id}>{x.name || x.type}</li>
            ))}
            {diff.added.length > 20 ? <li className="text-muted">…и ещё {diff.added.length - 20}</li> : null}
          </ul>
        </div>
        <div>
          <div className="mb-1 font-semibold text-rose-600">Удалено ({diff.removed.length})</div>
          <ul className="space-y-0.5 text-muted">
            {diff.removed.slice(0, 20).map((x) => (
              <li key={x.id} className="truncate" title={x.id}>{x.name || x.type}</li>
            ))}
            {diff.removed.length > 20 ? <li className="text-muted">…и ещё {diff.removed.length - 20}</li> : null}
          </ul>
        </div>
        <div>
          <div className="mb-1 font-semibold text-amber-600">Изменено ({diff.changed.length})</div>
          <ul className="space-y-0.5 text-muted">
            {diff.changed.slice(0, 20).map((x) => (
              <li key={x.id} className="truncate" title={x.id}>{x.name || x.type}</li>
            ))}
            {diff.changed.length > 20 ? <li className="text-muted">…и ещё {diff.changed.length - 20}</li> : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-border px-3 py-2 text-[11px] text-muted">
        Наложено маркеров: добавлено {badgeSummary.added}, изменено {badgeSummary.changed}. Маркеры «удалено» не отображаются на целевой диаграмме — см. список слева.
      </div>
    </div>
  );
}
