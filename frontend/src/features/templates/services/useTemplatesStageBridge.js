import { useCallback, useMemo } from "react";
import { applyTemplateToDiagram } from "./applyTemplateToDiagram.js";
import { buildBpmnFragmentInsertPayload, readTemplatePackFromTemplate } from "./applyBpmnFragmentTemplatePlacement.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function delay(ms = 0) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(ms || 0)));
  });
}

function toFinite(value, fallback = Number.NaN) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function isFinitePoint(pointRaw) {
  const point = pointRaw && typeof pointRaw === "object" ? pointRaw : {};
  return Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function readInsertedTemplateElementIds(insertedRaw) {
  const inserted = asObject(insertedRaw);
  const ids = new Set();
  const remap = asObject(inserted.remap);
  Object.values(remap).forEach((value) => {
    const id = toText(value);
    if (id) ids.add(id);
  });
  const entryNodeId = toText(inserted.entryNodeId);
  const exitNodeId = toText(inserted.exitNodeId);
  if (entryNodeId) ids.add(entryNodeId);
  if (exitNodeId) ids.add(exitNodeId);
  return Array.from(ids);
}

function toValidBounds(boundsRaw) {
  const bounds = asObject(boundsRaw);
  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(width > 0) || !(height > 0)) return null;
  return { x, y, width, height };
}

function toValidViewbox(snapshotRaw) {
  const snapshot = asObject(snapshotRaw);
  const viewboxRaw = snapshot.viewbox && typeof snapshot.viewbox === "object" ? snapshot.viewbox : snapshot;
  const x = Number(viewboxRaw?.x);
  const y = Number(viewboxRaw?.y);
  const width = Number(viewboxRaw?.width);
  const height = Number(viewboxRaw?.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(width > 0) || !(height > 0)) return null;
  return { x, y, width, height };
}

export function shouldNudgeViewportToElement(boundsRaw, snapshotRaw, options = {}) {
  const bounds = toValidBounds(boundsRaw);
  const viewbox = toValidViewbox(snapshotRaw);
  if (!bounds || !viewbox) return false;
  const padding = Math.max(0, Number(options.padding ?? 48));
  const minVisibleRatio = Math.max(0, Math.min(1, Number(options.minVisibleRatio ?? 0.65)));
  const paddedLeft = viewbox.x + padding;
  const paddedTop = viewbox.y + padding;
  const paddedRight = viewbox.x + viewbox.width - padding;
  const paddedBottom = viewbox.y + viewbox.height - padding;
  if (!(paddedRight > paddedLeft) || !(paddedBottom > paddedTop)) return true;
  const left = bounds.x;
  const top = bounds.y;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const overlapW = Math.max(0, Math.min(right, paddedRight) - Math.max(left, paddedLeft));
  const overlapH = Math.max(0, Math.min(bottom, paddedBottom) - Math.max(top, paddedTop));
  const overlapArea = overlapW * overlapH;
  const totalArea = Math.max(1, bounds.width * bounds.height);
  const visibleRatio = overlapArea / totalArea;
  return visibleRatio < minVisibleRatio;
}

export default function useTemplatesStageBridge({
  selectedBpmnElement,
  draftNodes,
  sessionId,
  bpmnApiRef,
  bpmnStageHostRef,
  clientToDiagram,
  onPersistedTemplateApply = null,
}) {
  const selectedElementId = toText(selectedBpmnElement?.id);
  const selectedElementName = toText(selectedBpmnElement?.name || selectedElementId);
  const selectedElementType = toText(selectedBpmnElement?.type);
  const selectedElementLaneName = toText(selectedBpmnElement?.laneName);

  const runtimeSelectedIds = useMemo(() => {
    const api = bpmnApiRef?.current;
    if (!api || typeof api.getSelectedElementIds !== "function") return [];
    try {
      return asArray(api.getSelectedElementIds({ view: "editor" }))
        .map((row) => toText(row))
        .filter(Boolean);
    } catch {
      return [];
    }
  }, [bpmnApiRef, selectedBpmnElement?.selectedIds, selectedElementId]);

  const selectedBpmnIds = useMemo(() => {
    const ids = new Set(
      [
        ...runtimeSelectedIds,
        ...asArray(selectedBpmnElement?.selectedIds),
      ]
        .map((row) => toText(row))
        .filter(Boolean),
    );
    if (selectedElementId) ids.add(selectedElementId);
    return Array.from(ids);
  }, [runtimeSelectedIds, selectedBpmnElement?.selectedIds, selectedElementId]);

  const selectionNodes = useMemo(() => {
    if (!selectedBpmnIds.length) return [];
    const byId = new Set(selectedBpmnIds);
    return asArray(draftNodes).filter((node) => byId.has(toText(node?.id)));
  }, [draftNodes, selectedBpmnIds]);

  const selectionContext = useMemo(() => ({
    name: selectedElementName || selectedElementId,
    primaryName: selectedElementName || selectedElementId,
    primaryElementId: selectedElementId,
    sourceSessionId: toText(sessionId),
    elementTypes: Array.from(new Set([
      ...selectionNodes.map((node) => toText(node?.type)).filter(Boolean),
      selectedElementType,
    ].filter(Boolean))),
    laneNames: Array.from(new Set([
      ...selectionNodes
        .map((node) => toText(node?.laneName || node?.lane_name || node?.lane || node?.role || node?.area))
        .filter(Boolean),
      selectedElementLaneName,
    ].filter(Boolean))),
  }), [
    selectedElementId,
    selectedElementLaneName,
    selectedElementName,
    selectedElementType,
    selectionNodes,
    sessionId,
  ]);

  const getSelectedBpmnIds = useCallback(() => selectedBpmnIds, [selectedBpmnIds]);

  const applyBpmnSelection = useCallback(async (idsRaw, options = {}) => applyTemplateToDiagram(
    bpmnApiRef?.current,
    idsRaw,
    {
      label: "Template",
      focusFirst: false,
      ...options,
    },
  ), [bpmnApiRef]);

  const captureBpmnFragmentTemplatePack = useCallback(async (options = {}) => {
    const api = bpmnApiRef?.current;
    if (!api || typeof api.captureTemplatePack !== "function") {
      return { ok: false, error: "capture_api_unavailable" };
    }
    try {
      const result = await Promise.resolve(api.captureTemplatePack(options));
      if (!result?.ok) {
        return { ok: false, error: toText(result?.error || "fragment_capture_failed") };
      }
      return result;
    } catch (error) {
      return { ok: false, error: toText(error?.message || error || "fragment_capture_failed") };
    }
  }, [bpmnApiRef]);

  const isDiagramClientPoint = useCallback((clientXRaw, clientYRaw) => {
    const x = Number(clientXRaw);
    const y = Number(clientYRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") return false;
    const target = document.elementFromPoint(x, y);
    if (!(target instanceof Element)) return false;
    const host = bpmnStageHostRef?.current;
    if (host instanceof Element && host.contains(target)) return true;
    return !!target.closest?.(".bpmnStageHost");
  }, [bpmnStageHostRef]);

  const insertBpmnFragmentTemplateAtPoint = useCallback(async (templateRaw, options = {}) => {
    const api = bpmnApiRef?.current;
    if (!api || typeof api.insertTemplatePack !== "function") {
      return { ok: false, error: "insert_api_unavailable" };
    }
    const pack = readTemplatePackFromTemplate(templateRaw);
    if (!pack) return { ok: false, error: "invalid_pack" };
    const clientX = Number(options?.clientX);
    const clientY = Number(options?.clientY);
    let diagramPoint = typeof clientToDiagram === "function"
      ? clientToDiagram(clientX, clientY)
      : null;
    if (!isFinitePoint(diagramPoint)) {
      const snapshot = typeof api.getCanvasSnapshot === "function"
        ? api.getCanvasSnapshot({ mode: "editor" })
        : null;
      const viewbox = snapshot?.viewbox && typeof snapshot.viewbox === "object" ? snapshot.viewbox : snapshot;
      const scale = Math.max(0.000001, toFinite(snapshot?.zoom ?? viewbox?.scale, 1));
      const host = bpmnStageHostRef?.current;
      if (host instanceof Element && viewbox && typeof viewbox === "object") {
        const rect = host.getBoundingClientRect();
        diagramPoint = {
          x: toFinite(viewbox.x, 0) + ((clientX - toFinite(rect.left, 0)) / scale),
          y: toFinite(viewbox.y, 0) + ((clientY - toFinite(rect.top, 0)) / scale),
        };
      }
    }
    const payload = buildBpmnFragmentInsertPayload(
      {
        pack,
        title: toText(templateRaw?.title),
      },
      {
        mode: toText(options?.mode || "after") || "after",
        preferPointAnchor: options?.preferPointAnchor === true,
        clientPoint: { x: clientX, y: clientY },
        diagramPoint,
      },
    );
    if (!payload) return { ok: false, error: "invalid_insert_payload" };
    try {
      const inserted = await Promise.resolve(api.insertTemplatePack(payload));
      if (inserted?.ok) {
        const insertedIds = readInsertedTemplateElementIds(inserted);
        if (insertedIds.length) {
          if (typeof api.selectElements === "function") {
            try {
              api.selectElements(insertedIds, {
                focusFirst: false,
                source: "template_apply_visibility",
              });
            } catch {
            }
          }
          if (typeof api.flashNode === "function") {
            insertedIds.slice(0, 8).forEach((id, index) => {
              try {
                api.flashNode(id, "accent", {
                  showPill: index === 0,
                  label: "Template inserted",
                  durationMs: 1400,
                });
              } catch {
              }
            });
          }
          const focusCandidateId = toText(inserted?.entryNodeId || insertedIds[0]);
          if (
            focusCandidateId
            && typeof api.getElementBounds === "function"
            && typeof api.getCanvasSnapshot === "function"
            && typeof api.focusNode === "function"
          ) {
            try {
              const bounds = api.getElementBounds(focusCandidateId, { mode: "editor" });
              const snapshot = api.getCanvasSnapshot({ mode: "editor" });
              if (shouldNudgeViewportToElement(bounds, snapshot)) {
                api.focusNode(focusCandidateId, {
                  source: "template_apply_visibility",
                  durationMs: 1400,
                });
              }
            } catch {
            }
          }
        }
      }
      if (!inserted?.ok || options?.persistImmediately !== true) {
        return inserted;
      }
      if (typeof api.saveLocal !== "function") {
        return { ok: false, error: "save_api_unavailable" };
      }
      let saved = await Promise.resolve(api.saveLocal({
        force: true,
        source: toText(options?.source || "template_apply"),
        trigger: "template_apply",
        saveOwner: "template_apply",
      }));
      let attempts = 0;
      while (saved?.ok && saved?.pending === true && attempts < 20) {
        attempts += 1;
        await delay(150);
        saved = await Promise.resolve(api.saveLocal({
          force: true,
          source: toText(options?.source || "template_apply"),
          trigger: "template_apply",
          saveOwner: "template_apply",
        }));
      }
      if (!saved?.ok) {
        return { ok: false, error: toText(saved?.error || "persist_failed"), inserted };
      }
      if (saved?.pending === true) {
        return { ok: false, error: "persist_pending_timeout", inserted };
      }
      if (typeof onPersistedTemplateApply === "function") {
        try {
          await Promise.resolve(onPersistedTemplateApply({
            template: templateRaw,
            inserted,
            saved,
          }));
        } catch {
        }
      }
      return {
        ...inserted,
        persisted: true,
        persistedSource: toText(saved?.source || "backend"),
      };
    } catch (error) {
      return { ok: false, error: toText(error?.message || error || "insert_failed") };
    }
  }, [bpmnApiRef, bpmnStageHostRef, clientToDiagram, onPersistedTemplateApply]);

  const insertBpmnFragmentTemplateImmediately = useCallback(async (templateRaw, options = {}) => {
    const rect = options?.diagramContainerRect && typeof options.diagramContainerRect === "object"
      ? options.diagramContainerRect
      : null;
    const fallbackWidth = typeof window !== "undefined" ? Number(window.innerWidth || 1280) : 1280;
    const fallbackHeight = typeof window !== "undefined" ? Number(window.innerHeight || 800) : 800;
    const clientX = rect
      ? Number(rect.left || 0) + Math.round(Number(rect.width || fallbackWidth) / 2)
      : Math.round(fallbackWidth / 2);
    const clientY = rect
      ? Number(rect.top || 0) + Math.round(Number(rect.height || fallbackHeight) / 2)
      : Math.round(fallbackHeight / 2);
    return insertBpmnFragmentTemplateAtPoint(templateRaw, {
      clientX,
      clientY,
      mode: toText(options?.mode || "after") || "after",
      preferPointAnchor: options?.preferPointAnchor !== false,
      persistImmediately: options?.persistImmediately !== false,
      source: toText(options?.source || "template_apply"),
    });
  }, [insertBpmnFragmentTemplateAtPoint]);

  return {
    selectedBpmnIds,
    selectionContext,
    getSelectedBpmnIds,
    applyBpmnSelection,
    captureBpmnFragmentTemplatePack,
    insertBpmnFragmentTemplateAtPoint,
    insertBpmnFragmentTemplateImmediately,
    isDiagramClientPoint,
  };
}
