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

export const FALLBACK_TOOLS = [
  { id: "select", icon: "⌖", label: "Выбор", runtimeSupported: true },
  { id: "rect", icon: "▭", label: "Прямоугольник", runtimeSupported: true },
  { id: "text", icon: "T", label: "Текст", runtimeSupported: true },
  { id: "container", icon: "▣", label: "Контейнер", runtimeSupported: true },
  { id: "note", icon: "🗒", label: "Стикер", runtimeSupported: true },
];

export const FloatingDrawioToolbar = memo(function FloatingDrawioToolbar({
  tools, activeTool, drawioEnabled, drawioMode, drawioLocked,
  setDrawioMode, onOpenDrawioEditor,
}) {
  if (!drawioEnabled || drawioMode !== "edit") return null;
  const toolList = asArray(tools).length ? asArray(tools) : FALLBACK_TOOLS;
  return (
    <div className="floatingDrawioToolbar" data-testid="floating-drawio-toolbar">
      {toolList.map(rowRaw => {
        const row = asObject(rowRaw);
        const toolId = toText(row.id).toLowerCase();
        const intent = resolveDrawioToolIntent({ toolId, enabled: drawioEnabled, locked: drawioLocked });
        const isActive = activeTool === toolId;
        return (
          <button key={toolId} type="button"
            className={`secondaryBtn flex h-8 w-8 items-center justify-center p-0 text-[14px] ${isActive ? "ring-2 ring-accent" : ""}`}
            onClick={() => {
              if (intent.intent === "blocked") return;
              if (intent.intent === "mode_edit") { setDrawioMode?.("edit", { toolId }); return; }
              onOpenDrawioEditor?.();
            }}
            disabled={intent.intent === "blocked"}
            title={`${toText(row.label)} (${toolId.charAt(0).toUpperCase()})`}
            data-testid={`floating-drawio-tool-${toolId}`}>
            <span aria-hidden="true">{toText(row.icon)}</span>
          </button>
        );
      })}
    </div>
  );
});

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

function entityTypeIcon(entityKind, entityId) {
  if (entityKind !== OVERLAY_ENTITY_KINDS.DRAWIO) return "◆";
  const id = toText(entityId);
  if (id.startsWith("rect_")) return "▭";
  if (id.startsWith("text_")) return "T";
  if (id.startsWith("container_")) return "▣";
  if (id.startsWith("note_")) return "🗒";
  return "◆";
}

const OverlayRowsSection = memo(function OverlayRowsSection({
  title,
  rows,
  emptyText = "Нет элементов.",
  listTestId = "diagram-action-layers-item-list",
  defaultLimit = 0,
  bpmnRef,
  hybridV2BindingByHybridId,
  setHybridV2ActiveId,
  setDrawioSelectedElementId,
  goToHybridLayerItem,
  onDeleteOverlayEntity,
  onSetElementVisible,
  onSetElementLocked,
  elementStateMap,
  onReorderElements,
  onRenameElement,
  onUndeleteElement,
}) {
  const list = asArray(rows);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editValue, setEditValue] = useState("");
  const [dragOverId, setDragOverId] = useState("");
  const [undoToast, setUndoToast] = useState(null);
  const undoTimerRef = React.useRef(0);
  const [expanded, setExpanded] = useState(false);
  const stateMap = asObject(elementStateMap);
  const hasLimit = defaultLimit > 0 && list.length > defaultLimit;
  const baseList = hasLimit && !expanded && !search ? list.slice(0, defaultLimit) : list;
  const truncatedCount = list.length - baseList.length;
  const filteredList = useMemo(() => {
    if (!search) return baseList;
    const q = search.toLowerCase();
    return baseList.filter((rowRaw) => {
      const row = asObject(rowRaw);
      return toText(row.label).toLowerCase().includes(q)
        || toText(row.entityId).toLowerCase().includes(q);
    });
  }, [baseList, search]);

  const handleRowClick = (entityKind, entityId) => {
    if (editingId) return;
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
    }
  };

  const startRename = (entityId, currentLabel) => {
    setEditingId(entityId);
    setEditValue(currentLabel);
  };

  const commitRename = (entityId, originalLabel) => {
    const trimmed = editValue.trim();
    setEditingId("");
    if (!trimmed || trimmed === originalLabel) return;
    const clamped = trimmed.length > 40 ? trimmed.slice(0, 40) : trimmed;
    onRenameElement?.(entityId, clamped, `layers_rename_${entityId}`);
  };

  const cancelRename = () => {
    setEditingId("");
    setEditValue("");
  };

  const handleDeleteWithUndo = (entityKind, entityId, titleText) => {
    const payload = { entityKind, entityId, entityIds: [entityId], label: titleText };
    if (!confirmOverlayDelete(payload)) return;
    const deleted = !!onDeleteOverlayEntity?.(payload, `layers_delete_row_${entityKind}`);
    pushDeleteTrace("layers_delete_row_result", { rowDeleteId: entityId, rowDeleteKind: entityKind, deleted });
    if (!deleted || !onUndeleteElement) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    const timerId = window.setTimeout(() => { setUndoToast(null); undoTimerRef.current = 0; }, 5000);
    undoTimerRef.current = timerId;
    setUndoToast({ entityId, entityKind, label: titleText });
  };

  const handleUndo = () => {
    if (!undoToast) return;
    onUndeleteElement?.(undoToast.entityId, `layers_undo_delete_${undoToast.entityId}`);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = 0;
    setUndoToast(null);
  };

  const dismissUndo = () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = 0;
    setUndoToast(null);
  };

  const handleDragStart = (e, entityId) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", entityId);
    e.currentTarget.style.opacity = "0.4";
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = "";
    setDragOverId("");
  };

  const handleDragOver = (e, entityId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== entityId) setDragOverId(entityId);
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    setDragOverId("");
    const sourceId = e.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId || !onReorderElements) return;
    const ids = filteredList.map((r) => toText(asObject(r).entityId)).filter(Boolean);
    const srcIdx = ids.indexOf(sourceId);
    const tgtIdx = ids.indexOf(targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    ids.splice(srcIdx, 1);
    ids.splice(tgtIdx, 0, sourceId);
    onReorderElements(ids, "layers_dnd_reorder");
  };

  const canDrag = !!onReorderElements && !search;
  return (
    <>
      <div className="diagramToolbarOverlayTitle mt-2">{title}</div>
      {list.length > 8 ? (
        <div className="relative mt-1">
          <input
            type="text"
            className="w-full rounded border border-[hsl(var(--border)/0.6)] bg-transparent px-2 py-1 text-[11px] outline-none focus:border-[hsl(var(--accent)/0.6)]"
            placeholder="Найти..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="diagram-action-layers-search"
          />
          {search ? (
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[11px] text-[hsl(var(--muted))] hover:text-[hsl(var(--fg))]"
              onClick={() => setSearch("")}
              title="Очистить"
            >
              ✕
            </button>
          ) : null}
        </div>
      ) : null}
      {filteredList.length === 0 ? (
        <div className="diagramActionPopoverEmpty">{search ? "Ничего не найдено." : emptyText}</div>
      ) : (
        <div className="hybridLayerPopoverList mt-2" data-testid={listTestId}>
          {filteredList.map((rowRaw) => {
            const row = asObject(rowRaw);
            const entityKind = toText(row.entityKind).toLowerCase();
            const entityId = toText(row.entityId);
            const titleText = toText(row.label || entityId);
            if (!entityId) return null;
            const elState = asObject(stateMap[entityId]);
            const isVisible = elState.visible !== false;
            const isLocked = elState.locked === true;
            const hasToggles = !!onSetElementVisible && !!onSetElementLocked;
            const isEditing = editingId === entityId;
            const isDragOver = dragOverId === entityId;
            return (
              <div
                key={toText(row.key) || `${entityKind}_${entityId}`}
                className={`hybridLayerPopoverRow${isDragOver ? " ring-1 ring-accent/60" : ""}`}
                onClick={() => handleRowClick(entityKind, entityId)}
                draggable={canDrag}
                onDragStart={(e) => handleDragStart(e, entityId)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, entityId)}
                onDrop={(e) => handleDrop(e, entityId)}
                title={isEditing ? undefined : `${titleText} — click to select`}
              >
                {canDrag ? (
                  <span
                    className="flex-shrink-0 w-4 cursor-grab text-center text-[10px] text-[hsl(var(--muted))] select-none"
                    aria-hidden="true"
                    title="Перетащите для изменения порядка"
                  >
                    ⋮⋮
                  </span>
                ) : null}
                <span className="flex-shrink-0 w-5 text-center text-[12px]" aria-hidden="true">
                  {entityTypeIcon(entityKind, entityId)}
                </span>
                <div className="hybridLayerPopoverMain">
                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      className="w-full rounded border border-[hsl(var(--accent)/0.6)] bg-transparent px-1 py-0 text-[11px] font-semibold outline-none"
                      value={editValue}
                      maxLength={40}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { commitRename(entityId, titleText); e.preventDefault(); }
                        if (e.key === "Escape") { cancelRename(); e.preventDefault(); }
                        e.stopPropagation();
                      }}
                      onBlur={() => commitRename(entityId, titleText)}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`diagram-action-layers-rename-input-${entityId}`}
                    />
                  ) : (
                    <span
                      className="hybridLayerPopoverTitle cursor-text hover:underline"
                      title={`${titleText} — double-click to rename`}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (onRenameElement && entityKind === OVERLAY_ENTITY_KINDS.DRAWIO) {
                          startRename(entityId, titleText);
                        }
                      }}
                    >
                      {titleText || "—"}
                    </span>
                  )}
                  <span className="hybridLayerPopoverMeta">
                    {entityId}{toText(row.layer_id) ? ` · ${toText(row.layer_id)}` : ""} · {kindLabel(entityKind)}
                  </span>
                </div>
                <div className="hybridLayerPopoverActions" onClick={(e) => e.stopPropagation()}>
                  {hasToggles ? (
                    <>
                      <button
                        type="button"
                        className={`secondaryBtn h-6 w-6 p-0 text-[13px] ${!isVisible ? "opacity-40 line-through" : ""}`}
                        onClick={() => onSetElementVisible?.(entityId, !isVisible, `layers_row_visible_${entityId}`)}
                        title={isVisible ? "Скрыть" : "Показать"}
                        data-testid={`diagram-action-layers-row-visible-${entityId}`}
                      >
                        👁
                      </button>
                      <button
                        type="button"
                        className={`secondaryBtn h-6 w-6 p-0 text-[13px] ${!isLocked ? "opacity-40" : ""}`}
                        onClick={() => onSetElementLocked?.(entityId, !isLocked, `layers_row_lock_${entityId}`)}
                        title={isLocked ? "Разблокировать" : "Заблокировать"}
                        data-testid={`diagram-action-layers-row-lock-${entityId}`}
                      >
                        {isLocked ? "🔒" : "🔓"}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="secondaryBtn h-6 w-6 p-0 text-[13px]"
                    onClick={() => handleDeleteWithUndo(entityKind, entityId, titleText)}
                    title={`Удалить ${titleText}`}
                    data-testid="diagram-action-layers-delete-item"
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
          {truncatedCount > 0 && (
            <button
              type="button"
              className="secondaryBtn mt-1 h-7 w-full px-2 text-[11px] text-muted"
              onClick={() => setExpanded(true)}
              data-testid="diagram-action-layers-show-all"
            >
              +{truncatedCount} скрыто — показать все
            </button>
          )}
          {expanded && hasLimit && (
            <button
              type="button"
              className="secondaryBtn mt-1 h-7 w-full px-2 text-[11px] text-muted"
              onClick={() => setExpanded(false)}
              data-testid="diagram-action-layers-collapse"
            >
              Свернуть
            </button>
          )}
        </div>
      )}
      {undoToast ? (
        <div
          className="mt-1 flex items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50/90 px-2 py-1.5 text-[11px] text-emerald-900"
          data-testid="diagram-action-layers-undo-toast"
        >
          <span className="min-w-0 flex-1 truncate">{`"${undoToast.label}" удалён`}</span>
          <button
            type="button"
            className="shrink-0 rounded border border-emerald-400/40 bg-white/50 px-2 py-0.5 text-[11px] font-semibold hover:bg-white/80"
            onClick={handleUndo}
            data-testid="diagram-action-layers-undo-btn"
          >
            Отменить
          </button>
          <button
            type="button"
            className="shrink-0 text-[11px] opacity-60 hover:opacity-100"
            onClick={dismissUndo}
          >
            ✕
          </button>
        </div>
      ) : null}
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
  onReorderDrawioElements,
  onRenameDrawioElement,
  onUndeleteDrawioElement,
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
  const selectedDrawioCanonicalRow = useMemo(() => {
    if (!selectedIsDrawio) return {};
    return asObject(asArray(drawioState?.drawio_elements_v1).find((rowRaw) => toText(asObject(rowRaw).id) === selectedEntityId));
  }, [drawioState?.drawio_elements_v1, selectedEntityId, selectedIsDrawio]);
  const selectedDrawioRow = useMemo(() => {
    if (!selectedIsDrawio) return {};
    const fromPanel = asObject(drawioRows.find((rowRaw) => toText(asObject(rowRaw).entityId || asObject(rowRaw).id) === selectedEntityId));
    if (Object.keys(fromPanel).length) return fromPanel;
    return selectedDrawioCanonicalRow;
  }, [drawioRows, selectedDrawioCanonicalRow, selectedEntityId, selectedIsDrawio]);
  const selectedDrawioRuntimeRow = useMemo(
    () => (Object.keys(selectedDrawioCanonicalRow).length ? selectedDrawioCanonicalRow : selectedDrawioRow),
    [selectedDrawioCanonicalRow, selectedDrawioRow],
  );
  const selectedLayerId = selectedIsDrawio
    ? toText(selectedDrawioRow.layer_id)
    : toText(selectedHybridElement?.layer_id);
  const selectedDrawioIsNote = selectedIsDrawio && toText(selectedDrawioRuntimeRow.type).toLowerCase() === "note";
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
  const selectedDrawioStyleSurface = useMemo(() => {
    if (selectedDrawioIsNote) return "shape";
    return resolveRuntimeStyleSurface(selectedDrawioSnapshot);
  }, [selectedDrawioIsNote, selectedDrawioSnapshot]);
  const selectedDrawioStylePresets = useMemo(
    () => getRuntimeStylePresets(selectedDrawioStyleSurface),
    [selectedDrawioStyleSurface],
  );
  const selectedDrawioStylePreset = useMemo(() => {
    const noteStyle = asObject(selectedDrawioRuntimeRow.style);
    const attrs = selectedDrawioIsNote
      ? {
        fill: toText(noteStyle.bg_color),
        stroke: toText(noteStyle.border_color),
        "stroke-width": "2",
      }
      : selectedDrawioSnapshot?.attrs;
    return matchRuntimeStylePreset(selectedDrawioStyleSurface, attrs);
  }, [selectedDrawioIsNote, selectedDrawioRuntimeRow.style, selectedDrawioSnapshot?.attrs, selectedDrawioStyleSurface]);
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
  const selectedDrawioResizeSurface = useMemo(() => {
    if (selectedDrawioIsNote) return "box";
    return resolveRuntimeResizeSurface(selectedDrawioSnapshot);
  }, [selectedDrawioIsNote, selectedDrawioSnapshot]);
  const selectedDrawioSize = useMemo(() => {
    if (selectedDrawioIsNote) {
      const width = Number(selectedDrawioRuntimeRow.width);
      const height = Number(selectedDrawioRuntimeRow.height);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        return { width, height };
      }
      return null;
    }
    return readRuntimeResizableSize(selectedDrawioSnapshot);
  }, [selectedDrawioIsNote, selectedDrawioRuntimeRow.height, selectedDrawioRuntimeRow.width, selectedDrawioSnapshot]);
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
  const [hybridSectionOpen, setHybridSectionOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isPanelFloating, setIsPanelFloating] = useState(false);
  const [floatingPos, setFloatingPos] = useState({ x: 200, y: 100 });
  const drawioElementStateMap = useMemo(() => {
    const map = {};
    asArray(drawioState?.drawio_elements_v1).forEach((row) => {
      const id = toText(asObject(row).id);
      if (id) map[id] = { visible: asObject(row).visible, locked: asObject(row).locked };
    });
    return map;
  }, [drawioState?.drawio_elements_v1]);
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

  useEffect(() => {
    if (!open) return undefined;
    const TOOL_KEYS = { v: "select", r: "rect", t: "text", c: "container", s: "note" };
    const onPanelKeyDown = (event) => {
      const target = event?.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = String(event?.key || "").toLowerCase();
      const toolId = TOOL_KEYS[key];
      if (toolId && !event.ctrlKey && !event.metaKey && !event.shiftKey && drawioEnabled) {
        setDrawioMode?.("edit", { toolId });
        event.preventDefault();
        return;
      }
      if (key === "escape" && selectedEntityId) {
        setDrawioSelectedElementId?.("");
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onPanelKeyDown);
    return () => window.removeEventListener("keydown", onPanelKeyDown);
  }, [open, drawioEnabled, selectedEntityId, setDrawioMode, setDrawioSelectedElementId]);

  if (!open) return null;

  return (
    <div
      className={`diagramActionPopover diagramActionPopover--layers${isPanelFloating ? " diagramActionPopover--floating" : ""}`}
      ref={popoverRef}
      data-testid="diagram-action-layers-popover"
      style={isPanelFloating ? { left: floatingPos.x, top: floatingPos.y } : undefined}
      onMouseDown={isPanelFloating ? undefined : onMouseDown}
    >
      {/* ── Шапка ── */}
      <div className="diagramActionPopoverHead"
        onMouseDown={(e) => {
          if (!isPanelFloating) { onMouseDown?.(e); return; }
          e.stopPropagation();
          const sx = e.clientX - floatingPos.x, sy = e.clientY - floatingPos.y;
          const onMove = (ev) => setFloatingPos({ x: ev.clientX - sx, y: ev.clientY - sy });
          const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      >
        <span className="font-semibold text-[13px]">Overlay</span>
        <div className="diagramActionPopoverActions mt-0">
          <span className="diagramIssueChip text-[10px]" title={drawioStatusLabel}>{drawioStatusLabel}</span>
          <button type="button" className="secondaryBtn h-6 w-6 p-0 text-[13px]"
            onClick={() => setIsPanelFloating(p => !p)}
            title={isPanelFloating ? "Закрепить" : "Открепить"}>
            {isPanelFloating ? "📌" : "↗"}
          </button>
          <button type="button" className="secondaryBtn h-6 w-6 p-0 text-[13px]" onClick={onClose} title="Закрыть">✕</button>
        </div>
      </div>

      {/* ── 1. Выбранный объект ── */}
      <div className="diagramToolbarOverlaySection">
        <div className="diagramToolbarOverlayTitle">Выбранный объект</div>
        <div className="diagramIssueRows">
          {!selectedEntityId ? (
            <div className="py-4 text-center">
              <span className="text-[12px] text-slate-500">{selectedObjectUx.summary}</span>
              <div className="flex justify-center gap-1 mt-2 opacity-50">
                {runtimeTools.map(t => {
                  const row = asObject(t);
                  return <span key={toText(row.id)} title={toText(row.label)} className="text-[14px]">{toText(row.icon)}</span>;
                })}
              </div>
            </div>
          ) : (<>
          <div className="diagramIssueRow">
            <span className="font-semibold text-[13px]" data-testid="diagram-action-layers-selection-chip">
              {selectedLabel || "—"}
            </span>
            <span className="diagramIssueChip text-[10px]" data-testid="diagram-action-layers-selected-type-chip">
              {selectedObjectUx.typeLabel}
            </span>
          </div>

          {/* Быстрые действия — compact icon-only */}
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className="secondaryBtn h-6 w-6 p-0 text-[13px]"
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
              title="Удалить"
              data-testid="diagram-action-layers-delete-selected"
            >
              🗑
            </button>
            <button
              type="button"
              className="secondaryBtn h-6 w-6 p-0 text-[13px]"
              onClick={() => {
                if (selectedIsDrawio) {
                  onSetDrawioElementVisible?.(selectedEntityId, false, "layers_hide_selected_drawio");
                  return;
                }
                onHideSelectedHybridItems?.();
              }}
              disabled={!canHideSelected}
              title="Скрыть"
              data-testid="diagram-action-layers-hide-selected"
            >
              👁
            </button>
            <button
              type="button"
              className="secondaryBtn h-6 w-6 p-0 text-[13px]"
              onClick={() => {
                if (selectedIsDrawio) {
                  onSetDrawioElementLocked?.(selectedEntityId, true, "layers_lock_selected_drawio");
                  return;
                }
                onLockSelectedHybridItems?.();
              }}
              disabled={!canLockSelected}
              title="Блок"
              data-testid="diagram-action-layers-lock-selected"
            >
              🔒
            </button>
            <button
              type="button"
              className="secondaryBtn h-6 w-6 p-0 text-[13px]"
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
              title="Фокус"
              data-testid="diagram-action-layers-focus-selected"
            >
              🎯
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

          {/* Стиль (Draw.io) — circular swatches */}
          {selectedIsDrawio && selectedObjectUx.showStyleSection ? (
            <SelectedObjectGroup
              title={selectedObjectUx.styleSectionLabel}
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
                      className={`h-7 w-7 rounded-full border-2 transition-shadow ${isActive ? "border-accent ring-2 ring-accent/40 scale-110" : "border-slate-300 hover:scale-105"}`}
                      style={{ backgroundColor: swatchColor }}
                      onClick={() => onSetDrawioElementStylePreset?.(selectedEntityId, preset.id, `layers_selected_drawio_style_${preset.id}`)}
                      disabled={!selectedDrawioStyleActionEnabled}
                      title={toText(preset.label)}
                      data-testid={`diagram-action-layers-selected-style-${preset.id}`}
                    />
                  );
                })}
              </div>
            </SelectedObjectGroup>
          ) : null}

          {/* ▸ Дополнительно (collapsible Advanced) */}
          <button className="secondaryBtn h-6 px-2 text-[10px]"
            onClick={() => setAdvancedOpen(p => !p)}>
            {advancedOpen ? "▾ Свернуть" : "▸ Дополнительно"}
          </button>
          {advancedOpen ? (
            <>
              {/* ID row */}
              {selectedEntityId ? (
                <div className="diagramIssueRow">
                  <span className="font-mono text-[10px] text-[hsl(var(--muted))]">
                    {selectedEntityId}{selectedLayerId ? ` · ${selectedLayerId}` : ""} · {kindLabel(selectedKind)}
                  </span>
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

              {/* Размер (Draw.io) — auto-apply, no OK button */}
              {selectedIsDrawio && selectedObjectUx.showResizeSection ? (
                <SelectedObjectGroup
                  title={selectedObjectUx.resizeSectionLabel}
                  hint="W / H"
                  testId="diagram-action-layers-selected-group-size"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[11px] text-slate-500">W</span>
                    <input
                      id="layers-selected-width"
                      name="layers_selected_width"
                      type="number" min="24" max="1600" step="1"
                      className="min-w-0 w-20 rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-900"
                      value={selectedDrawioWidthDraft}
                      onChange={(event) => setSelectedDrawioWidthDraft(event.target.value)}
                      onBlur={applySelectedDrawioSize}
                      onKeyDown={(e) => { if (e.key === "Enter") applySelectedDrawioSize(); }}
                      disabled={!selectedDrawioResizeActionEnabled}
                      data-testid="diagram-action-layers-selected-width-input"
                    />
                    <span className="text-[11px] text-slate-500">H</span>
                    <input
                      id="layers-selected-height"
                      name="layers_selected_height"
                      type="number" min="24" max="1600" step="1"
                      className="min-w-0 w-20 rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-900"
                      value={selectedDrawioHeightDraft}
                      onChange={(event) => setSelectedDrawioHeightDraft(event.target.value)}
                      onBlur={applySelectedDrawioSize}
                      onKeyDown={(e) => { if (e.key === "Enter") applySelectedDrawioSize(); }}
                      disabled={!selectedDrawioResizeActionEnabled}
                      data-testid="diagram-action-layers-selected-height-input"
                    />
                  </div>
                </SelectedObjectGroup>
              ) : null}
            </>
          ) : null}
          </>)}
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
                id="layers-drawio-enabled"
                name="layers_drawio_enabled"
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
                className={`secondaryBtn h-7 px-3 text-[11px] ${drawioMode === "edit" ? "bg-emerald-50 ring-1 ring-emerald-400/60" : ""}`}
                onClick={() => setDrawioMode?.(drawioMode === "edit" ? "view" : "edit")}
                disabled={!drawioEnabled || drawioLocked}
                data-testid="diagram-action-layers-mode-toggle"
              >
                {drawioMode === "edit" ? "\u2705 Готово" : "\u270f\ufe0f Редактировать"}
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
              id="layers-drawio-opacity"
              name="layers_drawio_opacity"
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

        <OverlayRowsSection
          title={`Draw.io elements (${filteredDrawioRows.length}${showImportAffectedOnly ? ` / affected from ${drawioRows.length}` : ""})`}
          rows={filteredDrawioRows}
          emptyText="Нет draw.io элементов."
          defaultLimit={40}
          bpmnRef={bpmnRef}
          hybridV2BindingByHybridId={hybridV2BindingByHybridId}
          setHybridV2ActiveId={setHybridV2ActiveId}
          setDrawioSelectedElementId={setDrawioSelectedElementId}
          goToHybridLayerItem={goToHybridLayerItem}
          onDeleteOverlayEntity={onDeleteOverlayEntity}
          onSetElementVisible={onSetDrawioElementVisible}
          onSetElementLocked={onSetDrawioElementLocked}
          elementStateMap={drawioElementStateMap}
          onReorderElements={onReorderDrawioElements}
          onRenameElement={onRenameDrawioElement}
          onUndeleteElement={onUndeleteDrawioElement}
        />
      </div>

      {/* ── 3. Hybrid / Legacy (компактно, свёрнуто по умолчанию) ── */}
      <div className="diagramToolbarOverlaySection">
        <button
          type="button"
          className="diagramToolbarOverlayTitle w-full text-left"
          onClick={() => setHybridSectionOpen((prev) => !prev)}
          style={{ cursor: "pointer" }}
        >
          <span>{hybridSectionOpen ? "▾" : "▸"}</span>
          {" "}Hybrid / Legacy (H {hybridRows.length} · L {legacyRows.length})
        </button>
        {hybridSectionOpen ? (<>
        <div className="diagramIssueRows">
          {/* Строка 1: toggle + фокус + opacity */}
          <div className="diagramIssueRow">
            <label className="diagramActionCheckboxRow">
              <input
                id="layers-hybrid-enabled"
                name="layers_hybrid_enabled"
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
              <input id="layers-hybrid-lock" name="layers_hybrid_lock" type="checkbox" checked={!!hybridUiPrefs.lock} onChange={toggleHybridLayerLock} data-testid="diagram-action-layers-lock" />
              <span>Блок</span>
            </label>
            <label className="diagramActionCheckboxRow">
              <input id="layers-hybrid-focus" name="layers_hybrid_focus" type="checkbox" checked={hybridFocusActive} onChange={toggleHybridLayerFocus} disabled={!hybridVisible} data-testid="diagram-action-layers-focus" />
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
                        <input id={`layers-layer-visible-${layerId}`} name={`layers_layer_visible_${layerId}`} type="checkbox" checked={layer.visible !== false} onChange={() => toggleHybridV2LayerVisibility(layerId)} data-testid={`diagram-action-layers-layer-visible-${layerId}`} />
                        <span>вид</span>
                      </label>
                      <label className="diagramActionCheckboxRow">
                        <input id={`layers-layer-lock-${layerId}`} name={`layers_layer_lock_${layerId}`} type="checkbox" checked={layer.locked === true} onChange={() => toggleHybridV2LayerLock(layerId)} data-testid={`diagram-action-layers-layer-lock-${layerId}`} />
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
          defaultLimit={60}
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
          defaultLimit={40}
          bpmnRef={bpmnRef}
          hybridV2BindingByHybridId={hybridV2BindingByHybridId}
          setHybridV2ActiveId={setHybridV2ActiveId}
          goToHybridLayerItem={goToHybridLayerItem}
          onDeleteOverlayEntity={onDeleteOverlayEntity}
        />
        </>) : null}
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
