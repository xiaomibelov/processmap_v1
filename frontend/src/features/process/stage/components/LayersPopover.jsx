import React, { memo, useEffect, useMemo, useState } from "react";

import { pushDeleteTrace } from "../utils/deleteTrace";
import { OVERLAY_ENTITY_KINDS } from "../../drawio/domain/drawioEntityKinds";
import { resolveDrawioToolIntent } from "../../drawio/runtime/drawioCreateGuard.js";
import { readDrawioElementSnapshot, readDrawioTextElementContent } from "../../drawio/drawioSvg.js";
import {
  getRuntimeStylePresets,
  matchRuntimeStylePreset,
  resolveRuntimeStyleSurface,
} from "../../drawio/drawioRuntimeStylePresets.js";
import {
  readRuntimeResizableSize,
  resolveRuntimeResizeSurface,
} from "../../drawio/drawioRuntimeGeometry.js";
import { readRuntimeTextState } from "../../drawio/drawioRuntimeText.js";
import { readDrawioDocXmlCellGeometry } from "../../drawio/drawioDocXml.js";
import { resolveSelectedObjectUxModel } from "../../drawio/drawioSelectedObjectUx.js";
import {
  describeDrawioAnchor,
  formatDrawioAnchorStatusLabel,
  isDrawioAnchorableRow,
  readDrawioAnchorStatus,
  resolveDefaultDrawioAnchorRelation,
} from "../../drawio/drawioAnchors.js";

function toText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function kindLabel(kindRaw) {
  const kind = toText(kindRaw).toLowerCase();
  if (kind === OVERLAY_ENTITY_KINDS.DRAWIO) return "draw.io";
  if (kind === OVERLAY_ENTITY_KINDS.HYBRID) return "hybrid";
  if (kind === OVERLAY_ENTITY_KINDS.LEGACY) return "legacy";
  return "unknown";
}

const FALLBACK_TOOLS = [
  { id: "select", icon: "⌖", label: "Выбор", runtimeSupported: true },
  { id: "rect", icon: "▭", label: "Прямоугольник", runtimeSupported: true },
  { id: "text", icon: "T", label: "Текст", runtimeSupported: true },
  { id: "container", icon: "▣", label: "Контейнер", runtimeSupported: true },
];

function confirmHybridDelete(idsRaw, labelRaw = "") {
  const ids = asArray(idsRaw).map((row) => toText(row)).filter(Boolean);
  if (!ids.length) return false;
  if (typeof window === "undefined" || typeof window.confirm !== "function") return true;
  const label = toText(labelRaw);
  const subject = ids.length === 1 ? (label || ids[0]) : `${ids.length} шт.`;
  return window.confirm(`Удалить элемент Hybrid: ${subject}?`);
}

function confirmDrawioDelete(idRaw) {
  const id = toText(idRaw);
  if (!id) return false;
  if (typeof window === "undefined" || typeof window.confirm !== "function") return true;
  return window.confirm(`Удалить элемент Draw.io: ${id}?`);
}

function confirmOverlayDelete(entityRaw = {}) {
  const entity = asObject(entityRaw);
  const kind = toText(entity.entityKind || entity.kind).toLowerCase();
  const id = toText(entity.entityId || asArray(entity.entityIds)[0]);
  const label = toText(entity.label || id);
  if (!kind || !id) return false;
  if (kind === OVERLAY_ENTITY_KINDS.HYBRID) {
    return confirmHybridDelete(asArray(entity.entityIds).length ? entity.entityIds : [id], label);
  }
  if (kind === OVERLAY_ENTITY_KINDS.LEGACY) {
    return confirmHybridDelete([id], label);
  }
  return confirmDrawioDelete(id);
}

const OverlayRowsSection = memo(function OverlayRowsSection({
  title,
  rows,
  emptyText = "Нет элементов.",
  listTestId = "diagram-action-layers-item-list",
  bpmnRef,
  hybridV2BindingByHybridId,
  setHybridV2ActiveId,
  setDrawioSelectedElementId,
  goToHybridLayerItem,
  onDeleteOverlayEntity,
}) {
  const list = asArray(rows);
  return (
    <>
      <div className="diagramToolbarOverlayTitle mt-2">{title}</div>
      {list.length === 0 ? (
        <div className="diagramActionPopoverEmpty">{emptyText}</div>
      ) : (
        <div className="hybridLayerPopoverList mt-2" data-testid={listTestId}>
          {list.map((rowRaw) => {
            const row = asObject(rowRaw);
            const entityKind = toText(row.entityKind).toLowerCase();
            const entityId = toText(row.entityId);
            const titleText = toText(row.label || entityId);
            if (!entityId) return null;
            return (
              <div key={toText(row.key) || `${entityKind}_${entityId}`} className="hybridLayerPopoverRow">
                <div className="hybridLayerPopoverMain">
                  <span className="hybridLayerPopoverTitle" title={titleText}>{titleText || "—"}</span>
                  <span className="hybridLayerPopoverMeta">
                    {entityId} · {kindLabel(entityKind)}
                    {toText(row.subtitle) ? ` · ${toText(row.subtitle)}` : ""}
                  </span>
                  {entityKind === OVERLAY_ENTITY_KINDS.DRAWIO && toText(row.anchorIssueText) ? (
                    <span className="hybridLayerPopoverMeta">{toText(row.anchorIssueText)}</span>
                  ) : null}
                </div>
                <div className="hybridLayerPopoverActions">
                  {(() => {
                    const MAX_VISIBLE_CHIPS = 2;
                    const chips = [];
                    if (row.missing) chips.push({ key: "missing", text: "нет привязки" });
                    if (entityKind === OVERLAY_ENTITY_KINDS.DRAWIO && toText(row.anchorStatusLabel)) {
                      chips.push({ key: "anchor", text: toText(row.anchorStatusLabel), testId: `diagram-action-layers-row-anchor-${entityId}` });
                    }
                    if (entityKind === OVERLAY_ENTITY_KINDS.DRAWIO && toText(row.anchorTargetId)) {
                      chips.push({ key: "target", text: toText(row.anchorTargetId) });
                    }
                    const visible = chips.slice(0, MAX_VISIBLE_CHIPS);
                    const hiddenCount = chips.length - visible.length;
                    return (
                      <>
                        {visible.map((chip) => (
                          <span key={chip.key} className="diagramIssueChip" data-testid={chip.testId || undefined}>
                            {chip.text}
                          </span>
                        ))}
                        {hiddenCount > 0 ? (
                          <span
                            className="diagramIssueChip"
                            title={chips.slice(MAX_VISIBLE_CHIPS).map((c) => c.text).join(", ")}
                          >
                            +{hiddenCount}
                          </span>
                        ) : null}
                      </>
                    );
                  })()}
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={() => {
                      if (entityKind === OVERLAY_ENTITY_KINDS.LEGACY) {
                        goToHybridLayerItem?.(entityId, "layers_list_go_to_legacy");
                        return;
                      }
                      if (entityKind === OVERLAY_ENTITY_KINDS.HYBRID) {
                        const binding = asObject(hybridV2BindingByHybridId?.[entityId]);
                        const bpmnId = toText(binding.bpmn_id || binding.bpmnId);
                        setHybridV2ActiveId?.(entityId);
                        if (bpmnId) {
                          bpmnRef.current?.focusNode?.(bpmnId, { keepPrevious: false, durationMs: 1200 });
                        }
                        return;
                      }
                      if (entityKind === OVERLAY_ENTITY_KINDS.DRAWIO) {
                        setDrawioSelectedElementId?.(entityId);
                        return;
                      }
                    }}
                    disabled={false}
                    data-testid="diagram-action-layers-go-to"
                  >
                    {entityKind === OVERLAY_ENTITY_KINDS.DRAWIO ? "Выбрать" : "Перейти"}
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={() => {
                      const payload = {
                        entityKind,
                        entityId,
                        entityIds: [entityId],
                        label: titleText,
                      };
                      if (!confirmOverlayDelete(payload)) return;
                      const deleted = !!onDeleteOverlayEntity?.(payload, `layers_delete_row_${entityKind}`);
                      pushDeleteTrace("layers_delete_row_result", {
                        rowDeleteId: entityId,
                        rowDeleteKind: entityKind,
                        deleted,
                      });
                    }}
                    title={`Удалить ${titleText}`}
                    data-testid="diagram-action-layers-delete-item"
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
});

const SelectedObjectGroup = memo(function SelectedObjectGroup({
  title,
  hint = "",
  children,
  testId = "",
}) {
  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50/70 p-2"
      data-testid={testId || undefined}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-700">{title}</span>
        {hint ? <span className="text-[10px] text-slate-500">{hint}</span> : null}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
});

export default function LayersPopover({
  open,
  popoverRef,
  onClose,
  onMouseDown,
  hybridVisible,
  hybridTotalCount,
  showHybridLayer,
  hideHybridLayer,
  focusHybridLayer,
  hybridModeEffective,
  setHybridLayerMode,
  drawioModeEffective,
  setDrawioMode,
  hybridUiPrefs,
  onSetTool,
  setHybridLayerOpacity,
  toggleHybridLayerLock,
  toggleHybridLayerFocus,
  drawioState,
  onOpenDrawioEditor,
  onToggleDrawioVisible,
  onSetDrawioOpacity,
  onToggleDrawioLock,
  onSetDrawioElementVisible,
  onSetDrawioElementLocked,
  onSetDrawioElementText,
  onSetDrawioElementTextWidth,
  onSetDrawioElementStylePreset,
  onSetDrawioElementSize,
  onSetDrawioElementAnchor,
  onImportEmbeddedDrawioClick,
  onExportEmbeddedDrawio,
  hybridV2DocLive,
  hybridV2HiddenCount,
  revealAllHybridV2,
  toggleHybridV2LayerVisibility,
  toggleHybridV2LayerLock,
  setHybridV2LayerOpacity,
  hybridV2ActiveId,
  hybridV2SelectedIds,
  legacyActiveElementId,
  hybridV2BindPickMode,
  setHybridV2BindPickMode,
  goToActiveHybridBinding,
  hybridV2BindingByHybridId,
  exportHybridV2Drawio,
  onImportDrawioClick,
  hybridV2ImportNotice,
  hybridLayerCounts,
  hybridLayerVisibilityStats,
  cleanupMissingHybridBindings,
  hybridV2Renderable,
  setHybridV2ActiveId,
  drawioSelectedElementId,
  setDrawioSelectedElementId,
  drawioAnchorImportDiagnostics,
  overlayPanelModel,
  onDeleteOverlayEntity,
  bpmnRef,
  selectedElementContext,
  goToHybridLayerItem,
  onHideSelectedHybridItems,
  onLockSelectedHybridItems,
}) {
  const drawioEnabled = !!drawioState?.enabled;
  const drawioLocked = !!drawioState?.locked;
  const drawioHasDoc = toText(drawioState?.doc_xml).length > 0;
  const drawioHasPreview = toText(drawioState?.svg_cache).length > 0;
  const selectedHybridCount = Number(asArray(hybridV2SelectedIds).length || 0);
  const selectedHybridId = toText(hybridV2ActiveId);
  const selectedLegacyId = toText(legacyActiveElementId);
  const selectedDrawioId = toText(drawioSelectedElementId);

  const panelModel = asObject(overlayPanelModel);
  const panelStatus = asObject(panelModel.status);
  const panelEditor = asObject(panelModel.editor);
  const panelDrawio = asObject(panelModel.drawio);
  const panelHybridLegacy = asObject(panelModel.hybridLegacy);
  const panelSelected = asObject(panelModel.selected);
  const panelRows = asArray(panelModel.rows);
  const panelLayerGroups = asObject(panelModel.layerGroups);
  const panelTools = asObject(panelModel.tools);
  const runtimeTools = asArray(panelDrawio.tools?.runtime).length
    ? asArray(panelDrawio.tools.runtime)
    : (asArray(panelTools.runtime).length ? asArray(panelTools.runtime) : FALLBACK_TOOLS);
  const editorOnlyTools = asArray(panelDrawio.tools?.editorOnly).length
    ? asArray(panelDrawio.tools.editorOnly)
    : asArray(panelTools.editorOnly);
  const panelSelectedKind = toText(panelSelected.entityKind).toLowerCase();
  const panelSelectedIds = asArray(panelSelected.entityIds).map((row) => toText(row)).filter(Boolean);
  const panelSelectedId = toText(panelSelected.entityId) || panelSelectedIds[0];
  const selectedKind = panelSelectedKind || (selectedDrawioId ? OVERLAY_ENTITY_KINDS.DRAWIO : "");
  const selectedEntityId = panelSelectedId || selectedDrawioId || selectedHybridId || selectedLegacyId;
  const selectedEntityIds = panelSelectedIds.length ? panelSelectedIds : (selectedEntityId ? [selectedEntityId] : []);
  const selectedIsDrawio = selectedKind === OVERLAY_ENTITY_KINDS.DRAWIO;
  const selectedIsHybrid = selectedKind === OVERLAY_ENTITY_KINDS.HYBRID;
  const selectedIsLegacy = selectedKind === OVERLAY_ENTITY_KINDS.LEGACY;

  const drawioOpacityPct = Number(panelDrawio.opacityPct || Math.round(Math.max(0.05, Math.min(1, Number(drawioState?.opacity || 1))) * 100));
  const hybridOpacityPct = Number(panelHybridLegacy.opacityPct || Math.max(0, Math.min(100, Number(hybridUiPrefs.opacity || 0))));
  const drawioRows = asArray(panelDrawio.rows).length
    ? asArray(panelDrawio.rows)
    : (asArray(panelLayerGroups.drawio).length
    ? asArray(panelLayerGroups.drawio)
    : panelRows.filter((row) => toText(asObject(row).entityKind) === OVERLAY_ENTITY_KINDS.DRAWIO));
  const hybridRows = asArray(panelHybridLegacy.rows?.hybrid).length
    ? asArray(panelHybridLegacy.rows.hybrid)
    : (asArray(panelLayerGroups.hybrid).length
    ? asArray(panelLayerGroups.hybrid)
    : panelRows.filter((row) => toText(asObject(row).entityKind) === OVERLAY_ENTITY_KINDS.HYBRID));
  const legacyRows = asArray(panelHybridLegacy.rows?.legacy).length
    ? asArray(panelHybridLegacy.rows.legacy)
    : (asArray(panelLayerGroups.legacy).length
    ? asArray(panelLayerGroups.legacy)
    : panelRows.filter((row) => toText(asObject(row).entityKind) === OVERLAY_ENTITY_KINDS.LEGACY));
  const selectedLabel = toText(panelSelected.displayLabel || panelSelected.label)
    || (selectedHybridCount > 1 ? `${selectedHybridCount} шт.` : (selectedEntityId || "—"));
  const selectedHybridElement = asObject(
    asArray(hybridV2Renderable?.elements).find((rowRaw) => toText(asObject(rowRaw).id) === selectedHybridId),
  );
  const hiddenCount = Number(asObject(panelModel.hidden).count || hybridV2HiddenCount || 0);
  const drawioStatusLabel = toText(panelDrawio.statusLabel || panelStatus.label)
    || (drawioHasPreview ? "ON" : (drawioEnabled ? "ON · preview missing · hidden" : "OFF"));
  const drawioVisibleOnCanvas = panelDrawio.visibleOnCanvas === true || panelStatus.visibleOnCanvas === true;
  const drawioOpacityControlEnabled = panelDrawio.opacityControlEnabled === true || panelStatus.opacityControlEnabled === true;
  const drawioMode = toText(panelDrawio.interactionMode || drawioModeEffective || drawioState?.interaction_mode || "view");
  const drawioActiveTool = toText(panelDrawio.activeTool || drawioState?.active_tool || "select").toLowerCase();
  const drawioModeLabel = drawioMode === "edit"
    ? "Редактирование"
    : (drawioMode === "view" ? "Просмотр" : "Выключен");
  const hybridVisibleLabel = hybridVisible ? "Вкл" : "Выкл";
  const hybridFocusActive = panelHybridLegacy.focusActive === true;
  const canHideSelected = selectedIsDrawio ? !!selectedEntityId : selectedHybridCount > 0;
  const canLockSelected = selectedIsDrawio ? !!selectedEntityId : selectedHybridCount > 0;
  const selectedDrawioRow = useMemo(() => {
    if (!selectedIsDrawio) return {};
    const fromPanel = asObject(drawioRows.find((rowRaw) => toText(asObject(rowRaw).entityId || asObject(rowRaw).id) === selectedEntityId));
    if (Object.keys(fromPanel).length) return fromPanel;
    return asObject(asArray(drawioState?.drawio_elements_v1).find((rowRaw) => toText(asObject(rowRaw).id) === selectedEntityId));
  }, [drawioRows, drawioState?.drawio_elements_v1, selectedEntityId, selectedIsDrawio]);
  const selectedLayerId = selectedIsDrawio
    ? toText(selectedDrawioRow.layer_id)
    : toText(selectedHybridElement?.layer_id);
  const selectedDrawioText = useMemo(() => {
    if (!selectedIsDrawio || !selectedEntityId) return null;
    return readDrawioTextElementContent(drawioState?.svg_cache, selectedEntityId);
  }, [drawioState?.svg_cache, selectedEntityId, selectedIsDrawio]);
  const selectedDrawioSnapshot = useMemo(() => {
    if (!selectedIsDrawio || !selectedEntityId) return null;
    return readDrawioElementSnapshot(drawioState?.svg_cache, selectedEntityId);
  }, [drawioState?.svg_cache, selectedEntityId, selectedIsDrawio]);
  const selectedDrawioDocGeometry = useMemo(() => {
    if (!selectedIsDrawio || !selectedEntityId) return null;
    return readDrawioDocXmlCellGeometry(drawioState?.doc_xml, selectedEntityId);
  }, [drawioState?.doc_xml, selectedEntityId, selectedIsDrawio]);
  const selectedDrawioStyleSurface = useMemo(
    () => resolveRuntimeStyleSurface(selectedDrawioSnapshot),
    [selectedDrawioSnapshot],
  );
  const selectedDrawioStylePresets = useMemo(
    () => getRuntimeStylePresets(selectedDrawioStyleSurface),
    [selectedDrawioStyleSurface],
  );
  const selectedDrawioStylePreset = useMemo(
    () => matchRuntimeStylePreset(selectedDrawioStyleSurface, selectedDrawioSnapshot?.attrs),
    [selectedDrawioSnapshot?.attrs, selectedDrawioStyleSurface],
  );
  const selectedDrawioTextEditable = selectedDrawioText != null;
  const selectedDrawioTextState = useMemo(() => {
    if (!selectedIsDrawio || !selectedEntityId || !selectedDrawioTextEditable) return null;
    return readRuntimeTextState(drawioState?.svg_cache, selectedEntityId, {
      docGeometryRaw: selectedDrawioDocGeometry,
    });
  }, [
    drawioState?.svg_cache,
    selectedDrawioDocGeometry,
    selectedDrawioTextEditable,
    selectedEntityId,
    selectedIsDrawio,
  ]);
  const selectedDrawioResizeSurface = useMemo(
    () => resolveRuntimeResizeSurface(selectedDrawioSnapshot),
    [selectedDrawioSnapshot],
  );
  const selectedDrawioSize = useMemo(
    () => readRuntimeResizableSize(selectedDrawioSnapshot),
    [selectedDrawioSnapshot],
  );
  const selectedDrawioTextActionEnabled = selectedDrawioTextEditable
    && drawioEnabled
    && drawioMode === "edit"
    && !drawioLocked
    && selectedDrawioRow.visible !== false
    && selectedDrawioRow.locked !== true;
  const selectedDrawioStyleActionEnabled = !!selectedDrawioStyleSurface
    && drawioEnabled
    && drawioMode === "edit"
    && !drawioLocked
    && selectedDrawioRow.visible !== false
    && selectedDrawioRow.locked !== true;
  const selectedDrawioResizeActionEnabled = !!selectedDrawioResizeSurface
    && !!selectedDrawioSize
    && drawioEnabled
    && drawioMode === "edit"
    && !drawioLocked
    && selectedDrawioRow.visible !== false
    && selectedDrawioRow.locked !== true;
  const selectedDrawioAnchorStatus = selectedIsDrawio ? readDrawioAnchorStatus(selectedDrawioRow) : "unanchored";
  const selectedDrawioAnchorEligible = selectedIsDrawio && isDrawioAnchorableRow(selectedDrawioRow);
  const selectedDrawioAnchorTargetId = toText(asObject(selectedDrawioRow.anchor_v1).target_id || selectedDrawioRow.anchorTargetId);
  const selectedDrawioAnchorRelation = toText(asObject(selectedDrawioRow.anchor_v1).relation || selectedDrawioRow.anchorRelation)
    || resolveDefaultDrawioAnchorRelation(selectedDrawioRow);
  const selectedDrawioAnchorStatusLabel = formatDrawioAnchorStatusLabel(selectedDrawioAnchorStatus);
  const selectedDrawioAnchorInfo = describeDrawioAnchor(selectedDrawioRow, {
    validationDeferred: drawioState?._anchor_validation_deferred === true,
  });
  const drawioAnchorSummary = asObject(panelDrawio.anchorSummary);
  const importDiagnostics = asObject(drawioAnchorImportDiagnostics);
  const [showImportAffectedOnly, setShowImportAffectedOnly] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const affectedAnchorIds = useMemo(
    () => new Set(asArray(importDiagnostics.affectedObjectIds).map((id) => toText(id)).filter(Boolean)),
    [importDiagnostics.affectedObjectIds],
  );
  const filteredDrawioRows = useMemo(() => (
    showImportAffectedOnly
      ? drawioRows.filter((row) => affectedAnchorIds.has(toText(asObject(row).entityId || asObject(row).id)))
      : drawioRows
  ), [affectedAnchorIds, drawioRows, showImportAffectedOnly]);
  const [selectedDrawioTextDraft, setSelectedDrawioTextDraft] = useState(selectedDrawioText || "");
  const [selectedDrawioTextWidthDraft, setSelectedDrawioTextWidthDraft] = useState(selectedDrawioTextState?.width ? String(selectedDrawioTextState.width) : "");
  const [selectedDrawioWidthDraft, setSelectedDrawioWidthDraft] = useState(selectedDrawioSize?.width ? String(selectedDrawioSize.width) : "");
  const [selectedDrawioHeightDraft, setSelectedDrawioHeightDraft] = useState(selectedDrawioSize?.height ? String(selectedDrawioSize.height) : "");
  const selectedObjectUx = useMemo(() => resolveSelectedObjectUxModel({
    selectedKind,
    selectedEntityId,
    selectedLayerId,
    selectedDrawioTextEditable,
    selectedDrawioTextState,
    selectedDrawioStyleSurface,
    selectedDrawioStylePresetCount: selectedDrawioStylePresets.length,
    selectedDrawioResizeSurface,
    anchorEligible: selectedDrawioAnchorEligible,
    anchorStatus: selectedDrawioAnchorStatus,
  }), [
    selectedDrawioAnchorEligible,
    selectedDrawioAnchorStatus,
    selectedDrawioResizeSurface,
    selectedDrawioStylePresets.length,
    selectedDrawioStyleSurface,
    selectedDrawioTextEditable,
    selectedDrawioTextState,
    selectedEntityId,
    selectedKind,
    selectedLayerId,
  ]);

  useEffect(() => {
    setSelectedDrawioTextDraft(selectedDrawioText || "");
  }, [selectedDrawioText, selectedEntityId]);

  useEffect(() => {
    setSelectedDrawioTextWidthDraft(selectedDrawioTextState?.width ? String(selectedDrawioTextState.width) : "");
  }, [selectedDrawioTextState?.width, selectedEntityId]);

  useEffect(() => {
    setSelectedDrawioWidthDraft(selectedDrawioSize?.width ? String(selectedDrawioSize.width) : "");
    setSelectedDrawioHeightDraft(selectedDrawioSize?.height ? String(selectedDrawioSize.height) : "");
  }, [selectedDrawioSize?.height, selectedDrawioSize?.width, selectedEntityId]);

  useEffect(() => {
    if (asArray(importDiagnostics.affectedObjectIds).length > 0) return;
    if (showImportAffectedOnly) setShowImportAffectedOnly(false);
  }, [importDiagnostics.affectedObjectIds, showImportAffectedOnly]);

  const applySelectedDrawioText = () => {
    if (!selectedDrawioTextActionEnabled || !selectedEntityId) return;
    const changed = onSetDrawioElementText?.(
      selectedEntityId,
      selectedDrawioTextDraft,
      "layers_selected_drawio_text_apply",
    );
    if (changed) {
      setSelectedDrawioTextDraft(selectedDrawioTextDraft);
    }
  };

  const applySelectedDrawioTextWidth = () => {
    if (!selectedDrawioTextEditable || !selectedDrawioTextState || !selectedEntityId) return;
    onSetDrawioElementTextWidth?.(
      selectedEntityId,
      selectedDrawioTextWidthDraft,
      "layers_selected_drawio_text_width_apply",
    );
  };

  const applySelectedDrawioSize = () => {
    if (!selectedDrawioResizeActionEnabled || !selectedEntityId || !selectedDrawioSize) return;
    onSetDrawioElementSize?.(
      selectedEntityId,
      {
        width: selectedDrawioWidthDraft,
        height: selectedDrawioHeightDraft,
      },
      "layers_selected_drawio_resize_apply",
    );
  };
  const canApplyDrawioAnchor = selectedIsDrawio
    && selectedDrawioAnchorEligible
    && !!selectedEntityId
    && !!toText(selectedElementContext?.id)
    && drawioEnabled
    && drawioMode === "edit"
    && !drawioLocked
    && selectedDrawioRow.visible !== false
    && selectedDrawioRow.locked !== true;

  if (!open) return null;

  return (
    <div
      className="diagramActionPopover diagramActionPopover--layers"
      ref={popoverRef}
      data-testid="diagram-action-layers-popover"
      onMouseDown={onMouseDown}
    >
      {/* ── Шапка ── */}
      <div className="diagramActionPopoverHead">
        <span>Draw.io / Overlay</span>
        <div className="diagramActionPopoverActions mt-0">
          <span className="diagramIssueChip" title={drawioStatusLabel}>{drawioStatusLabel}</span>
          <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={onClose}>Закрыть</button>
        </div>
      </div>

      {/* ── 1. Выбранный объект (работа с элементами — на первом месте) ── */}
      <div className="diagramToolbarOverlaySection">
        <div className="diagramToolbarOverlayTitle">Выбранный объект</div>
        <div className="diagramIssueRows">
          <div className="diagramIssueRow">
            <span className="diagramIssueChip" data-testid="diagram-action-layers-selection-chip">
              {selectedLabel || "—"}
            </span>
            <span className="diagramIssueChip" data-testid="diagram-action-layers-selected-type-chip">
              {selectedObjectUx.typeLabel}
            </span>
            {selectedObjectUx.advancedBoundaryLabel ? (
              <span className="diagramIssueChip" data-testid="diagram-action-layers-selected-advanced-chip">
                {selectedObjectUx.advancedBoundaryLabel}
              </span>
            ) : null}
          </div>
          {selectedEntityId ? (
            <div className="diagramIssueRow">
              <span className="diagramIssueChip">
                {selectedEntityId}{selectedLayerId ? ` · ${selectedLayerId}` : ""} · {kindLabel(selectedKind)}
              </span>
            </div>
          ) : null}
          {selectedObjectUx.summary ? (
            <div className="diagramActionPopoverEmpty">{selectedObjectUx.summary}</div>
          ) : null}

          {/* Быстрые действия */}
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => {
                const payload = {
                  entityKind: selectedKind,
                  entityId: selectedEntityId,
                  entityIds: selectedEntityIds,
                  label: selectedLabel,
                };
                if (!payload.entityKind || !payload.entityId) return;
                if (!confirmOverlayDelete(payload)) return;
                const deleted = !!onDeleteOverlayEntity?.(payload, `layers_delete_selected_${payload.entityKind}`);
                pushDeleteTrace("layers_delete_selected_result", {
                  entityKind: payload.entityKind,
                  entityId: payload.entityId,
                  entityIds: payload.entityIds,
                  deleted,
                });
              }}
              disabled={!selectedKind || !selectedEntityId}
              data-testid="diagram-action-layers-delete-selected"
            >
              Удалить
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => {
                if (selectedIsDrawio) {
                  onSetDrawioElementVisible?.(selectedEntityId, false, "layers_hide_selected_drawio");
                  return;
                }
                onHideSelectedHybridItems?.();
              }}
              disabled={!canHideSelected}
              data-testid="diagram-action-layers-hide-selected"
            >
              Скрыть
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => {
                if (selectedIsDrawio) {
                  onSetDrawioElementLocked?.(selectedEntityId, true, "layers_lock_selected_drawio");
                  return;
                }
                onLockSelectedHybridItems?.();
              }}
              disabled={!canLockSelected}
              data-testid="diagram-action-layers-lock-selected"
            >
              Блок
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => {
                if (selectedIsLegacy) {
                  goToHybridLayerItem?.(selectedEntityId, "layers_selected_focus_legacy");
                  return;
                }
                if (selectedIsHybrid) {
                  goToActiveHybridBinding?.();
                }
              }}
              disabled={!selectedIsLegacy && !selectedIsHybrid}
              data-testid="diagram-action-layers-focus-selected"
            >
              Фокус
            </button>
          </div>

          {/* Привязка (Hybrid) */}
          {selectedObjectUx.showBindingSection ? (
            <div className="diagramActionPopoverActions mt-0">
              <button
                type="button"
                className={`secondaryBtn h-7 px-2 text-[11px] ${hybridV2BindPickMode ? "ring-1 ring-accent/60" : ""}`}
                onClick={() => setHybridV2BindPickMode((prev) => !prev)}
                disabled={!hybridV2ActiveId || hybridModeEffective !== "edit"}
                data-testid="diagram-action-layers-bind-pick"
              >
                {hybridV2BindPickMode ? "Выбор BPMN: ВКЛ" : "Привязать к BPMN"}
              </button>
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={goToActiveHybridBinding}
                disabled={!toText(asObject(hybridV2BindingByHybridId?.[hybridV2ActiveId]).bpmn_id)}
                data-testid="diagram-action-layers-go-bound"
              >
                К привязке
              </button>
            </div>
          ) : null}

          {/* Anchor (Draw.io) */}
          {selectedIsDrawio && selectedObjectUx.showAnchorSection ? (
            <SelectedObjectGroup
              title="Anchor"
              hint="explicit BPMN node id"
              testId="diagram-action-layers-selected-group-anchor"
            >
              <div className="diagramIssueRow">
                <div className="diagramActionPopoverActions mt-0">
                  <span className="diagramIssueChip" data-testid="diagram-action-layers-selected-anchor-status">
                    {selectedDrawioAnchorStatusLabel}
                  </span>
                  {selectedDrawioAnchorRelation ? (
                    <span className="diagramIssueChip" data-testid="diagram-action-layers-selected-anchor-relation">
                      {selectedDrawioAnchorRelation}
                    </span>
                  ) : null}
                  <span className="diagramIssueChip" data-testid="diagram-action-layers-selected-anchor-target">
                    {selectedDrawioAnchorTargetId || toText(selectedElementContext?.id) || "цель не задана"}
                  </span>
                  {selectedElementContext?.id ? (
                    <span className="diagramIssueChip" data-testid="diagram-action-layers-selected-anchor-selected-bpmn">
                      sel: {toText(selectedElementContext.id)}
                    </span>
                  ) : null}
                </div>
              </div>
              {toText(selectedDrawioAnchorInfo.issueText) ? (
                <div className="diagramActionPopoverEmpty">{toText(selectedDrawioAnchorInfo.issueText)}</div>
              ) : null}
              <div className="diagramActionPopoverActions mt-0">
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={() => {
                    if (!canApplyDrawioAnchor) return;
                    onSetDrawioElementAnchor?.(
                      selectedEntityId,
                      {
                        target_kind: "bpmn_node",
                        target_id: toText(selectedElementContext?.id),
                        relation: resolveDefaultDrawioAnchorRelation(selectedDrawioRow),
                        status: "anchored",
                        bound_at: new Date().toISOString(),
                      },
                      "layers_selected_drawio_anchor_apply",
                    );
                  }}
                  disabled={!canApplyDrawioAnchor}
                  data-testid="diagram-action-layers-selected-anchor-apply"
                >
                  Привязать к BPMN
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={() => {
                    if (!selectedEntityId) return;
                    onSetDrawioElementAnchor?.(selectedEntityId, null, "layers_selected_drawio_anchor_clear");
                  }}
                  disabled={!selectedEntityId || selectedDrawioAnchorStatus === "unanchored"}
                  data-testid="diagram-action-layers-selected-anchor-clear"
                >
                  Freeform
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={() => {
                    if (!selectedDrawioAnchorInfo.canJump) return;
                    bpmnRef?.current?.focusNode?.(selectedDrawioAnchorTargetId, { keepPrevious: false, durationMs: 1200 });
                  }}
                  disabled={!selectedDrawioAnchorInfo.canJump}
                  data-testid="diagram-action-layers-selected-anchor-focus"
                >
                  К цели BPMN
                </button>
              </div>
              {!selectedDrawioAnchorInfo.canJump && selectedDrawioAnchorStatus === "anchored" ? (
                <div className="diagramActionPopoverEmpty" data-testid="diagram-action-layers-selected-anchor-deferred-note">
                  Jump доступен после проверки target в BPMN.
                </div>
              ) : null}
            </SelectedObjectGroup>
          ) : null}


          {/* Стиль (Draw.io) */}
          {selectedIsDrawio && selectedObjectUx.showStyleSection ? (
            <SelectedObjectGroup
              title={selectedObjectUx.styleSectionLabel}
              hint="1 клик"
              testId="diagram-action-layers-selected-group-style"
            >
              <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                {selectedDrawioStylePresets.map((preset) => {
                  const isActive = toText(selectedDrawioStylePreset?.id) === toText(preset.id);
                  const swatchColor = toText(preset.svg?.fill || preset.svg?.stroke || "#cbd5e1");
                  return (
                    <button
                      key={`drawio_style_${preset.id}`}
                      type="button"
                      className={`secondaryBtn flex h-7 items-center gap-2 px-2 text-[11px] ${isActive ? "ring-1 ring-accent/60" : ""}`}
                      onClick={() => onSetDrawioElementStylePreset?.(selectedEntityId, preset.id, `layers_selected_drawio_style_${preset.id}`)}
                      disabled={!selectedDrawioStyleActionEnabled}
                      data-testid={`diagram-action-layers-selected-style-${preset.id}`}
                    >
                      <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border border-slate-300" style={{ backgroundColor: swatchColor }} />
                      <span>{toText(preset.label)}</span>
                    </button>
                  );
                })}
              </div>
            </SelectedObjectGroup>
          ) : null}

          {/* Размер (Draw.io) */}
          {selectedIsDrawio && selectedObjectUx.showResizeSection ? (
            <SelectedObjectGroup
              title={selectedObjectUx.resizeSectionLabel}
              hint="W / H"
              testId="diagram-action-layers-selected-group-size"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[11px] text-slate-500">W</span>
                <input
                  type="number" min="24" max="1600" step="1"
                  className="min-w-0 w-20 rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-900"
                  value={selectedDrawioWidthDraft}
                  onChange={(event) => setSelectedDrawioWidthDraft(event.target.value)}
                  disabled={!selectedDrawioResizeActionEnabled}
                  data-testid="diagram-action-layers-selected-width-input"
                />
                <span className="text-[11px] text-slate-500">H</span>
                <input
                  type="number" min="24" max="1600" step="1"
                  className="min-w-0 w-20 rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-900"
                  value={selectedDrawioHeightDraft}
                  onChange={(event) => setSelectedDrawioHeightDraft(event.target.value)}
                  disabled={!selectedDrawioResizeActionEnabled}
                  data-testid="diagram-action-layers-selected-height-input"
                />
                <button
                  type="button"
                  className="secondaryBtn h-7 px-2 text-[11px]"
                  onClick={applySelectedDrawioSize}
                  disabled={
                    !selectedDrawioResizeActionEnabled
                    || (String(selectedDrawioWidthDraft || "") === String(selectedDrawioSize?.width)
                      && String(selectedDrawioHeightDraft || "") === String(selectedDrawioSize?.height))
                  }
                  data-testid="diagram-action-layers-selected-size-apply"
                >
                  ОК
                </button>
              </div>
            </SelectedObjectGroup>
          ) : null}

          {selectedIsDrawio && selectedObjectUx.advancedHint ? (
            <div className="diagramActionPopoverEmpty" data-testid="diagram-action-layers-selected-advanced-note">
              {selectedObjectUx.advancedHint}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── 2. Draw.io Overlay (компактно) ── */}
      <div className="diagramToolbarOverlaySection">
        <div className="diagramToolbarOverlayTitle">Draw.io Overlay</div>
        <div className="diagramIssueRows">
          {/* Строка 1: toggle + режим + lock */}
          <div className="diagramIssueRow">
            <label className="diagramActionCheckboxRow">
              <input
                type="checkbox"
                checked={drawioEnabled}
                onChange={() => onToggleDrawioVisible?.()}
                data-testid="diagram-action-layers-drawio-toggle"
              />
              <span>Вкл</span>
            </label>
            <div className="diagramActionPopoverActions mt-0">
              <button
                type="button"
                className={`secondaryBtn h-7 px-2 text-[11px] ${drawioMode === "view" ? "ring-1 ring-accent/60" : ""}`}
                onClick={() => setDrawioMode?.("view")}
                data-testid="diagram-action-layers-mode-view"
              >
                Просмотр
              </button>
              <button
                type="button"
                className={`secondaryBtn h-7 px-2 text-[11px] ${drawioMode === "edit" ? "ring-1 ring-accent/60" : ""}`}
                onClick={() => setDrawioMode?.("edit")}
                disabled={!drawioEnabled || drawioLocked}
                data-testid="diagram-action-layers-mode-edit"
              >
                Ред.
              </button>
              <button
                type="button"
                className={`secondaryBtn h-7 px-2 text-[11px] ${drawioLocked ? "ring-1 ring-accent/60" : ""}`}
                onClick={() => onToggleDrawioLock?.()}
                data-testid="diagram-action-layers-drawio-lock"
                title="Lock"
              >
                🔒
              </button>
            </div>
          </div>
          {/* Строка 2: opacity */}
          <div className="diagramIssueRow">
            <span className="text-[10px] text-slate-500">Opacity</span>
            <input
              className="accent-accent flex-1"
              type="range" min="5" max="100" step="5"
              value={drawioOpacityPct}
              onChange={(event) => onSetDrawioOpacity?.(Number(event.target.value) / 100)}
              disabled={!drawioOpacityControlEnabled}
              data-testid="diagram-action-layers-drawio-opacity"
            />
            <span className="text-[10px] text-slate-500">{drawioOpacityPct}%</span>
          </div>
        </div>

        {/* Инструменты */}
        <div className="mt-1 grid grid-cols-2 gap-1">
          {runtimeTools.map((rowRaw) => {
            const row = asObject(rowRaw);
            const toolId = toText(row.id).toLowerCase();
            const toolIntent = resolveDrawioToolIntent({ toolId, enabled: drawioEnabled, locked: drawioLocked });
            return (
              <button
                key={`layers_tool_${toolId}`}
                type="button"
                className={`secondaryBtn flex h-8 items-center justify-start gap-2 px-2 text-[11px] ${drawioMode === "edit" && drawioActiveTool === toolId ? "ring-1 ring-accent/60" : ""}`}
                onClick={() => {
                  if (toolIntent.intent === "blocked") return;
                  if (toolIntent.intent === "mode_edit") { setDrawioMode?.("edit", { toolId }); return; }
                  onOpenDrawioEditor?.();
                }}
                disabled={toolIntent.intent === "blocked"}
                data-testid={`diagram-action-layers-tool-${toolId}`}
              >
                <span aria-hidden="true">{toText(row.icon)}</span>
                <span>{toText(row.label || row.id)}</span>
              </button>
            );
          })}
        </div>

        <OverlayRowsSection
          title={`Draw.io elements (${filteredDrawioRows.length}${showImportAffectedOnly ? ` / affected from ${drawioRows.length}` : ""})`}
          rows={filteredDrawioRows}
          emptyText="Нет draw.io элементов."
          bpmnRef={bpmnRef}
          hybridV2BindingByHybridId={hybridV2BindingByHybridId}
          setHybridV2ActiveId={setHybridV2ActiveId}
          setDrawioSelectedElementId={setDrawioSelectedElementId}
          goToHybridLayerItem={goToHybridLayerItem}
          onDeleteOverlayEntity={onDeleteOverlayEntity}
        />
      </div>

      {/* ── 3. Hybrid / Legacy (компактно) ── */}
      <div className="diagramToolbarOverlaySection">
        <div className="diagramToolbarOverlayTitle">Hybrid / Legacy</div>
        <div className="diagramIssueRows">
          {/* Строка 1: toggle + фокус + opacity */}
          <div className="diagramIssueRow">
            <label className="diagramActionCheckboxRow">
              <input
                type="checkbox"
                checked={!!hybridVisible}
                onChange={(event) => { if (event.target.checked) showHybridLayer(); else hideHybridLayer(); }}
                data-testid="diagram-action-layers-hybrid-toggle"
              />
              <span>Вкл</span>
            </label>
            <span className="diagramIssueChip">{hybridVisibleLabel} · H {hybridRows.length} · L {legacyRows.length}</span>
            <div className="diagramActionPopoverActions mt-0">
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={() => focusHybridLayer("layers_focus_button")}
                disabled={!hybridVisible || Number(hybridTotalCount || 0) <= 0}
                data-testid="diagram-action-layers-focus-visible"
              >
                Фокус
              </button>
              {[100, 60, 30].map((opacity) => (
                <button
                  key={`hybrid_opacity_${opacity}`}
                  type="button"
                  className={`secondaryBtn h-7 px-2 text-[11px] ${hybridOpacityPct === opacity ? "ring-1 ring-accent/60" : ""}`}
                  onClick={() => setHybridLayerOpacity(opacity)}
                  data-testid={`diagram-action-layers-opacity-${opacity}`}
                >
                  {opacity}%
                </button>
              ))}
            </div>
          </div>
          {/* Строка 2: lock + затемнить */}
          <div className="diagramIssueRow">
            <label className="diagramActionCheckboxRow">
              <input type="checkbox" checked={!!hybridUiPrefs.lock} onChange={toggleHybridLayerLock} data-testid="diagram-action-layers-lock" />
              <span>Блок</span>
            </label>
            <label className="diagramActionCheckboxRow">
              <input type="checkbox" checked={hybridFocusActive} onChange={toggleHybridLayerFocus} disabled={!hybridVisible} data-testid="diagram-action-layers-focus" />
              <span>Затемнить BPMN</span>
            </label>
          </div>
        </div>

        {/* Слои (видимость / opacity) */}
        {asArray(hybridV2DocLive?.layers).length > 0 ? (
          <>
            <div className="diagramToolbarOverlayTitle mt-2">
              Слои
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  className="secondaryBtn ml-2 h-6 px-2 text-[10px]"
                  onClick={() => revealAllHybridV2("hybrid_v2_reveal_all_button")}
                  data-testid="diagram-action-layers-reveal-all"
                >
                  Показать всё ({hiddenCount})
                </button>
              ) : null}
            </div>
            <div className="diagramIssueRows mt-1">
              {asArray(hybridV2DocLive?.layers).map((layerRaw) => {
                const layer = asObject(layerRaw);
                const layerId = toText(layer.id);
                if (!layerId) return null;
                const opacityPct = Math.max(10, Math.min(100, Math.round(Number(layer.opacity || 1) * 100)));
                return (
                  <div key={`hybrid_v2_layer_row_${layerId}`} className="diagramIssueRow">
                    <span className="min-w-0 truncate text-[11px]" title={toText(layer.name) || layerId}>
                      {toText(layer.name) || layerId}
                    </span>
                    <div className="diagramActionPopoverActions mt-0">
                      <label className="diagramActionCheckboxRow">
                        <input type="checkbox" checked={layer.visible !== false} onChange={() => toggleHybridV2LayerVisibility(layerId)} data-testid={`diagram-action-layers-layer-visible-${layerId}`} />
                        <span>вид</span>
                      </label>
                      <label className="diagramActionCheckboxRow">
                        <input type="checkbox" checked={layer.locked === true} onChange={() => toggleHybridV2LayerLock(layerId)} data-testid={`diagram-action-layers-layer-lock-${layerId}`} />
                        <span>блок</span>
                      </label>
                      {[100, 60, 30].map((opacity) => (
                        <button
                          key={`hybrid_layer_opacity_${layerId}_${opacity}`}
                          type="button"
                          className={`secondaryBtn h-7 px-2 text-[11px] ${opacityPct === opacity ? "ring-1 ring-accent/60" : ""}`}
                          onClick={() => setHybridV2LayerOpacity(layerId, opacity / 100)}
                          data-testid={`diagram-action-layers-layer-opacity-${layerId}-${opacity}`}
                        >
                          {opacity}%
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          hiddenCount > 0 ? (
            <div className="diagramIssueRow mt-1">
              <span className="diagramIssueChip">Скрыто: {hiddenCount}</span>
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={() => revealAllHybridV2("hybrid_v2_reveal_all_button")}
                disabled={hiddenCount <= 0}
                data-testid="diagram-action-layers-reveal-all"
              >
                Показать всё
              </button>
            </div>
          ) : null
        )}

        <OverlayRowsSection
          title={`Hybrid elements (${hybridRows.length})`}
          rows={hybridRows}
          emptyText="Нет элементов Hybrid."
          bpmnRef={bpmnRef}
          hybridV2BindingByHybridId={hybridV2BindingByHybridId}
          setHybridV2ActiveId={setHybridV2ActiveId}
          goToHybridLayerItem={goToHybridLayerItem}
          onDeleteOverlayEntity={onDeleteOverlayEntity}
        />
        <OverlayRowsSection
          title={`Legacy markers (${legacyRows.length})`}
          rows={legacyRows}
          emptyText="Нет legacy-маркеров."
          bpmnRef={bpmnRef}
          hybridV2BindingByHybridId={hybridV2BindingByHybridId}
          setHybridV2ActiveId={setHybridV2ActiveId}
          goToHybridLayerItem={goToHybridLayerItem}
          onDeleteOverlayEntity={onDeleteOverlayEntity}
        />
      </div>

      {/* ── 4. Служебные функции (свёрнуто по умолчанию) ── */}
      <div className="diagramToolbarOverlaySection">
        <button
          type="button"
          className="diagramToolbarOverlayTitle w-full text-left"
          onClick={() => setServiceOpen((prev) => !prev)}
          style={{ cursor: "pointer" }}
        >
          <span>{serviceOpen ? "▾" : "▸"}</span>
          {" "}Сервис
        </button>
        {serviceOpen ? (
          <>
            {/* Статус Draw.io */}
            <div className="diagramIssueRows mt-1">
              <div className="diagramIssueRow">
                <span>Draw.io</span>
                <span className="diagramIssueChip">{drawioStatusLabel} · {drawioModeLabel} · {drawioRows.length} эл.</span>
              </div>
              <div className="diagramIssueRow items-start">
                <span>Anchors</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  <span className="diagramIssueChip">anch {Number(drawioAnchorSummary.anchored || 0)}</span>
                  <span className="diagramIssueChip">free {Number(drawioAnchorSummary.unanchored || 0)}</span>
                  <span className="diagramIssueChip">orph {Number(drawioAnchorSummary.orphaned || 0)}</span>
                  <span className="diagramIssueChip">inv {Number(drawioAnchorSummary.invalid || 0)}</span>
                </div>
              </div>
              {Object.keys(importDiagnostics).length ? (
                <div className="diagramIssueRow items-start">
                  <span>Last import</span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    <span className="diagramIssueChip">
                      {importDiagnostics.validationDeferred ? "pending" : (importDiagnostics.importHasAnchorImpact ? "affected" : "ok")}
                    </span>
                    <span className="diagramIssueChip">before {Number(importDiagnostics.totalAnchoredBefore || 0)}</span>
                    <span className="diagramIssueChip">after {Number(importDiagnostics.totalAnchoredAfter || 0)}</span>
                  </div>
                </div>
              ) : null}
              {importDiagnostics.importHasAnchorImpact ? (
                <div className="diagramIssueRow">
                  <button
                    type="button"
                    className={`secondaryBtn h-7 px-2 text-[11px] ${showImportAffectedOnly ? "ring-1 ring-accent/60" : ""}`}
                    onClick={() => setShowImportAffectedOnly((prev) => !prev)}
                    data-testid="diagram-action-layers-import-affected-toggle"
                  >
                    {showImportAffectedOnly ? "Все overlay" : "Affected anchors"}
                  </button>
                </div>
              ) : null}
              {drawioState?._anchor_validation_deferred === true ? (
                <div className="diagramIssueRow">
                  <span>Anchor check</span>
                  <span className="diagramIssueChip">ожидает BPMN hydrate</span>
                </div>
              ) : null}
            </div>

            {/* Редактор Draw.io */}
            <div className="diagramToolbarOverlayTitle mt-2">Редактор Draw.io</div>
            <div className="diagramActionPopoverActions mt-1">
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={() => onOpenDrawioEditor?.()}
                disabled={drawioLocked || panelEditor.available === false}
                data-testid="diagram-action-layers-drawio-open"
              >
                Открыть редактор
              </button>
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={() => onImportEmbeddedDrawioClick?.()}
                disabled={drawioLocked}
                data-testid="diagram-action-layers-drawio-import"
              >
                Импорт .drawio
              </button>
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={() => onExportEmbeddedDrawio?.()}
                disabled={!drawioHasDoc}
                data-testid="diagram-action-layers-drawio-export"
              >
                Экспорт .drawio
              </button>
            </div>
            <div className="mt-1">
              <span className="diagramIssueChip">
                {panelEditor.opened ? "opened" : toText(panelEditor.status || "idle")}
                {panelEditor.lastSavedAt ? ` · ${panelEditor.lastSavedAt.replace("T", " ").slice(0, 16)}` : ""}
              </span>
            </div>

            {/* Hybrid codec */}
            <div className="diagramToolbarOverlayTitle mt-2">Hybrid codec</div>
            <div className="diagramActionPopoverActions mt-1">
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={exportHybridV2Drawio}
                disabled={!hybridVisible}
                data-testid="diagram-action-layers-export-drawio"
              >
                Экспорт Hybrid
              </button>
              <button
                type="button"
                className="secondaryBtn h-7 px-2 text-[11px]"
                onClick={onImportDrawioClick}
                disabled={!hybridVisible}
                data-testid="diagram-action-layers-import-drawio"
              >
                Импорт Hybrid
              </button>
            </div>

            {/* Диагностика */}
            <div className="diagramToolbarOverlayTitle mt-2">Diagnostics</div>
            <div className="diagramIssueRows mt-1">
              <div className="diagramIssueRow">
                <span className="diagramIssueChip">Готово {Number(hybridLayerCounts.ready || 0)}</span>
                <span className="diagramIssueChip">Незаполн. {Number(hybridLayerCounts.incomplete || 0)}</span>
              </div>
              <div className="diagramIssueRow">
                <span className="diagramIssueChip">
                  Привязки {Number(hybridLayerVisibilityStats.validBindings || 0)} ок / {Number(hybridLayerVisibilityStats.missingBindings || 0)} нет
                </span>
                <span className="diagramIssueChip">
                  VP {Number(hybridLayerVisibilityStats.insideViewport || 0)} / {Number(hybridLayerVisibilityStats.outsideViewport || 0)}
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* ── Уведомления ── */}
      {hybridV2ImportNotice ? (
        <div className="diagramActionPopoverEmpty mt-2">{hybridV2ImportNotice}</div>
      ) : null}
      {hybridVisible && Number(hybridLayerVisibilityStats.outsideViewport || 0) > 0 ? (
        <div className="diagramActionPopoverEmpty mt-2" data-testid="diagram-action-layers-outside-warning">
          Часть меток вне viewport. Нажмите «Фокус».
        </div>
      ) : null}
      {hybridVisible && Number(hybridLayerVisibilityStats.missingBindings || 0) > 0 ? (
        <div className="diagramActionPopoverActions mt-2">
          <button
            type="button"
            className="secondaryBtn h-7 px-2 text-[11px]"
            onClick={() => cleanupMissingHybridBindings("layers_cleanup_missing")}
            data-testid="diagram-action-layers-cleanup-missing"
          >
            Очистить привязки без цели ({Number(hybridLayerVisibilityStats.missingBindings || 0)})
          </button>
        </div>
      ) : null}
      {hybridVisible && Number(hybridTotalCount || 0) === 0 ? (
        <div className="diagramActionPopoverEmpty mt-2" data-testid="diagram-action-layers-empty-state">
          Нет элементов Hybrid. В режиме Edit кликни по узлу BPMN.
        </div>
      ) : null}
      <div className="muted mt-2 text-[10px]">Peek: удерживай <b>H</b></div>
    </div>
  );
}
