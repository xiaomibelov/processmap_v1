import React from "react";

import { pushDeleteTrace } from "../utils/deleteTrace";
import { OVERLAY_ENTITY_KINDS } from "../../drawio/domain/drawioEntityKinds";

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

function OverlayRowsSection({
  title,
  rows,
  bpmnRef,
  hybridV2BindingByHybridId,
  setHybridV2ActiveId,
  goToHybridLayerItem,
  onDeleteOverlayEntity,
}) {
  const list = asArray(rows);
  return (
    <>
      <div className="diagramToolbarOverlayTitle mt-2">{title}</div>
      {list.length === 0 ? (
        <div className="diagramActionPopoverEmpty">Нет элементов.</div>
      ) : (
        <div className="hybridLayerPopoverList mt-2" data-testid="diagram-action-layers-item-list">
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
                </div>
                <div className="hybridLayerPopoverActions">
                  {row.missing ? <span className="diagramIssueChip">нет привязки</span> : null}
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
                    }}
                    disabled={entityKind === OVERLAY_ENTITY_KINDS.DRAWIO}
                    data-testid="diagram-action-layers-go-to"
                  >
                    Перейти
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
}

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
  overlayPanelModel,
  onDeleteOverlayEntity,
  bpmnRef,
  goToHybridLayerItem,
  onHideSelectedHybridItems,
  onLockSelectedHybridItems,
}) {
  if (!open) return null;
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
  const panelSelected = asObject(panelModel.selected);
  const panelRows = asArray(panelModel.rows);
  const panelLayerGroups = asObject(panelModel.layerGroups);
  const panelTools = asObject(panelModel.tools);
  const runtimeTools = asArray(panelTools.runtime).length ? asArray(panelTools.runtime) : FALLBACK_TOOLS;
  const editorOnlyTools = asArray(panelTools.editorOnly);
  const panelSelectedKind = toText(panelSelected.entityKind).toLowerCase();
  const panelSelectedIds = asArray(panelSelected.entityIds).map((row) => toText(row)).filter(Boolean);
  const panelSelectedId = toText(panelSelected.entityId) || panelSelectedIds[0];
  const selectedKind = panelSelectedKind || (selectedDrawioId ? OVERLAY_ENTITY_KINDS.DRAWIO : "");
  const selectedEntityId = panelSelectedId || selectedDrawioId || selectedHybridId || selectedLegacyId;
  const selectedEntityIds = panelSelectedIds.length ? panelSelectedIds : (selectedEntityId ? [selectedEntityId] : []);
  const selectedIsDrawio = selectedKind === OVERLAY_ENTITY_KINDS.DRAWIO;
  const selectedIsHybrid = selectedKind === OVERLAY_ENTITY_KINDS.HYBRID;
  const selectedIsLegacy = selectedKind === OVERLAY_ENTITY_KINDS.LEGACY;

  const drawioOpacityPct = Math.round(Math.max(0.05, Math.min(1, Number(drawioState?.opacity || 1))) * 100);
  const hybridOpacityPct = Math.max(0, Math.min(100, Number(hybridUiPrefs.opacity || 0)));
  const drawioRows = asArray(panelLayerGroups.drawio).length
    ? asArray(panelLayerGroups.drawio)
    : panelRows.filter((row) => toText(asObject(row).entityKind) === OVERLAY_ENTITY_KINDS.DRAWIO);
  const hybridRows = asArray(panelLayerGroups.hybrid).length
    ? asArray(panelLayerGroups.hybrid)
    : panelRows.filter((row) => toText(asObject(row).entityKind) === OVERLAY_ENTITY_KINDS.HYBRID);
  const legacyRows = asArray(panelLayerGroups.legacy).length
    ? asArray(panelLayerGroups.legacy)
    : panelRows.filter((row) => toText(asObject(row).entityKind) === OVERLAY_ENTITY_KINDS.LEGACY);
  const selectedLabel = toText(panelSelected.displayLabel || panelSelected.label)
    || (selectedHybridCount > 1 ? `${selectedHybridCount} шт.` : (selectedEntityId || "—"));
  const selectedHybridElement = asObject(
    asArray(hybridV2Renderable?.elements).find((rowRaw) => toText(asObject(rowRaw).id) === selectedHybridId),
  );
  const selectedLayerId = toText(selectedHybridElement?.layer_id);
  const hiddenCount = Number(asObject(panelModel.hidden).count || hybridV2HiddenCount || 0);
  const overlayStatusLabel = toText(panelStatus.label) || (drawioHasPreview ? "ON" : "ON · preview missing");
  const overlaySummary = toText(panelStatus.summary)
    || `Overlay: ${drawioEnabled ? "on" : "off"} · Mode: ${hybridModeEffective === "edit" ? "edit" : "view"} · Lock: ${hybridUiPrefs.lock || drawioLocked ? "on" : "off"} · Opacity: ${drawioOpacityPct}%`;
  const canHideSelected = selectedIsDrawio ? !!selectedEntityId : selectedHybridCount > 0;
  const canLockSelected = selectedIsDrawio ? !!selectedEntityId : selectedHybridCount > 0;

  return (
    <div
      className="diagramActionPopover diagramActionPopover--layers"
      ref={popoverRef}
      data-testid="diagram-action-layers-popover"
      onMouseDown={onMouseDown}
    >
      <div className="diagramActionPopoverHead">
        <span>Draw.io / Overlay</span>
        <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={onClose}>Закрыть</button>
      </div>

      <div className="diagramToolbarOverlayTitle">Status</div>
      <div className="diagramIssueRows">
        <div className="diagramIssueRow">
          <span>Сводка</span>
          <span className="diagramIssueChip">{overlaySummary}</span>
        </div>
        <div className="diagramIssueRow">
          <label className="diagramActionCheckboxRow">
            <input
              type="checkbox"
              checked={drawioEnabled}
              onChange={() => onToggleDrawioVisible?.()}
              data-testid="diagram-action-layers-drawio-toggle"
            />
            <span>Overlay Draw.io</span>
          </label>
          <span className="diagramIssueChip">{overlayStatusLabel}</span>
        </div>
        <div className="diagramIssueRow">
          <span>Режим overlay</span>
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className={`secondaryBtn h-7 px-2 text-[11px] ${hybridModeEffective === "view" ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => setHybridLayerMode("view")}
              data-testid="diagram-action-layers-mode-view"
            >
              Просмотр
            </button>
            <button
              type="button"
              className={`secondaryBtn h-7 px-2 text-[11px] ${hybridModeEffective === "edit" ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => {
                showHybridLayer();
                setHybridLayerMode("edit");
              }}
              disabled={!hybridVisible || !!hybridUiPrefs.lock}
              data-testid="diagram-action-layers-mode-edit"
            >
              Редактирование
            </button>
          </div>
        </div>
        <div className="diagramIssueRow">
          <label className="diagramActionCheckboxRow">
            <input
              type="checkbox"
              checked={!!hybridVisible}
              onChange={(event) => {
                if (event.target.checked) showHybridLayer();
                else hideHybridLayer();
              }}
              data-testid="diagram-action-layers-hybrid-toggle"
            />
            <span>Hybrid ({Number(hybridTotalCount || 0)})</span>
          </label>
          <button
            type="button"
            className="secondaryBtn h-7 px-2 text-[11px]"
            onClick={() => focusHybridLayer("layers_focus_button")}
            disabled={!hybridVisible || Number(hybridTotalCount || 0) <= 0}
            data-testid="diagram-action-layers-focus-visible"
          >
            Фокус
          </button>
        </div>
        <div className="diagramIssueRow">
          <span>Draw.io lock</span>
          <button
            type="button"
            className={`secondaryBtn h-7 px-2 text-[11px] ${drawioLocked ? "ring-1 ring-accent/60" : ""}`}
            onClick={() => onToggleDrawioLock?.()}
            data-testid="diagram-action-layers-drawio-lock"
          >
            {drawioLocked ? "Заблокирован" : "Разблокирован"}
          </button>
        </div>
        <div className="diagramIssueRow">
          <span>Draw.io opacity</span>
          <input
            className="accent-accent"
            type="range"
            min="5"
            max="100"
            step="5"
            value={drawioOpacityPct}
            onChange={(event) => onSetDrawioOpacity?.(Number(event.target.value) / 100)}
            data-testid="diagram-action-layers-drawio-opacity"
          />
        </div>
        <div className="diagramIssueRow">
          <span>Hybrid opacity</span>
          <div className="diagramActionPopoverActions mt-0">
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
        <div className="diagramIssueRow">
          <label className="diagramActionCheckboxRow">
            <input
              type="checkbox"
              checked={!!hybridUiPrefs.lock}
              onChange={toggleHybridLayerLock}
              data-testid="diagram-action-layers-lock"
            />
            <span>Блокировка overlay</span>
          </label>
          <label className="diagramActionCheckboxRow">
            <input
              type="checkbox"
              checked={!!hybridUiPrefs.focus}
              onChange={toggleHybridLayerFocus}
              data-testid="diagram-action-layers-focus"
            />
            <span>Затемнить BPMN</span>
          </label>
        </div>
      </div>

      <div className="diagramToolbarOverlayTitle mt-2">Layers</div>
      <div className="diagramIssueRows">
        <div className="diagramIssueRow">
          <span>Draw.io / Hybrid / Legacy</span>
          <span className="diagramIssueChip">
            {drawioRows.length} / {hybridRows.length} / {legacyRows.length}
          </span>
        </div>
      </div>
      <OverlayRowsSection
        title="Draw.io elements"
        rows={drawioRows}
        bpmnRef={bpmnRef}
        hybridV2BindingByHybridId={hybridV2BindingByHybridId}
        setHybridV2ActiveId={setHybridV2ActiveId}
        goToHybridLayerItem={goToHybridLayerItem}
        onDeleteOverlayEntity={onDeleteOverlayEntity}
      />
      <OverlayRowsSection
        title="Hybrid V2 elements"
        rows={hybridRows}
        bpmnRef={bpmnRef}
        hybridV2BindingByHybridId={hybridV2BindingByHybridId}
        setHybridV2ActiveId={setHybridV2ActiveId}
        goToHybridLayerItem={goToHybridLayerItem}
        onDeleteOverlayEntity={onDeleteOverlayEntity}
      />
      <OverlayRowsSection
        title="Legacy markers"
        rows={legacyRows}
        bpmnRef={bpmnRef}
        hybridV2BindingByHybridId={hybridV2BindingByHybridId}
        setHybridV2ActiveId={setHybridV2ActiveId}
        goToHybridLayerItem={goToHybridLayerItem}
        onDeleteOverlayEntity={onDeleteOverlayEntity}
      />

      <div className="diagramToolbarOverlayTitle mt-2">Tools</div>
      <div className="diagramIssueRows">
        <div className="diagramIssueRow">
          <span>Overlay runtime</span>
          <span className="diagramIssueChip">
            {runtimeTools.map((row) => toText(asObject(row).label || asObject(row).id)).filter(Boolean).join(" / ")}
          </span>
        </div>
        {editorOnlyTools.length > 0 ? (
          <div className="diagramIssueRow">
            <span>Только в full editor</span>
            <span className="diagramIssueChip">
              {editorOnlyTools.map((row) => toText(asObject(row).label || asObject(row).id)).filter(Boolean).join(" / ")}
            </span>
          </div>
        ) : null}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {runtimeTools.map((rowRaw) => {
          const row = asObject(rowRaw);
          return (
            <button
              key={`layers_tool_${toText(row.id)}`}
              type="button"
              className="secondaryBtn flex h-9 items-center justify-start gap-2 px-2 text-[11px]"
              onClick={() => {
                showHybridLayer();
                setHybridLayerMode("edit");
                onSetTool?.(row.id);
              }}
              data-testid={`diagram-action-layers-tool-${row.id}`}
            >
              <span aria-hidden="true">{toText(row.icon)}</span>
              <span>{toText(row.label || row.id)}</span>
            </button>
          );
        })}
      </div>

      <div className="diagramToolbarOverlayTitle mt-2">Selected element</div>
      <div className="diagramIssueRows">
        <div className="diagramIssueRow">
          <span>Выбрано</span>
          <span className="diagramIssueChip" data-testid="diagram-action-layers-selection-chip">
            {selectedLabel} · {kindLabel(selectedKind)}
          </span>
        </div>
        <div className="diagramIssueRow">
          <span>ID / слой</span>
          <span className="diagramIssueChip">
            {selectedEntityId || "—"}{selectedLayerId ? ` · ${selectedLayerId}` : ""}
          </span>
        </div>
        <div className="diagramIssueRow">
          <span>Действия</span>
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
              Блокировать
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
        </div>
        <div className="diagramIssueRow">
          <span>Привязка</span>
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
              Перейти к привязке
            </button>
          </div>
        </div>
      </div>

      <div className="diagramToolbarOverlayTitle mt-2">Editor actions</div>
      <div className="diagramIssueRows">
        <div className="diagramIssueRow">
          <span>Full draw.io editor</span>
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => onOpenDrawioEditor?.()}
              disabled={drawioLocked || panelEditor.available === false}
              data-testid="diagram-action-layers-drawio-open"
            >
              Открыть
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => onImportEmbeddedDrawioClick?.()}
              disabled={drawioLocked}
              data-testid="diagram-action-layers-drawio-import"
            >
              Импорт
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => onExportEmbeddedDrawio?.()}
              disabled={!drawioHasDoc}
              data-testid="diagram-action-layers-drawio-export"
            >
              Экспорт
            </button>
          </div>
        </div>
        <div className="diagramIssueRow">
          <span>Статус editor</span>
          <span className="diagramIssueChip">
            {panelEditor.opened ? "opened" : toText(panelEditor.status || "idle")}
            {panelEditor.lastSavedAt ? ` · saved ${panelEditor.lastSavedAt.replace("T", " ").slice(0, 16)}` : ""}
          </span>
        </div>
        <div className="diagramIssueRow">
          <span>Hybrid codec (import/export)</span>
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={exportHybridV2Drawio}
              disabled={!hybridVisible}
              data-testid="diagram-action-layers-export-drawio"
            >
              Экспорт
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={onImportDrawioClick}
              disabled={!hybridVisible}
              data-testid="diagram-action-layers-import-drawio"
            >
              Импорт
            </button>
          </div>
        </div>
      </div>

      <div className="diagramToolbarOverlayTitle mt-2">Hidden / visibility</div>
      <div className="diagramIssueRows">
        <div className="diagramIssueRow">
          <span>Скрыто</span>
          <div className="diagramActionPopoverActions mt-0">
            <span className="diagramIssueChip">{hiddenCount}</span>
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
        </div>
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
                  <input
                    type="checkbox"
                    checked={layer.visible !== false}
                    onChange={() => toggleHybridV2LayerVisibility(layerId)}
                    data-testid={`diagram-action-layers-layer-visible-${layerId}`}
                  />
                  <span>вид</span>
                </label>
                <label className="diagramActionCheckboxRow">
                  <input
                    type="checkbox"
                    checked={layer.locked === true}
                    onChange={() => toggleHybridV2LayerLock(layerId)}
                    data-testid={`diagram-action-layers-layer-lock-${layerId}`}
                  />
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

      <div className="diagramToolbarOverlayTitle mt-2">Diagnostics</div>
      <div className="diagramIssueRows mt-2">
        <div className="diagramIssueRow">
          <span>Готово</span>
          <span className="diagramIssueChip">{Number(hybridLayerCounts.ready || 0)}</span>
        </div>
        <div className="diagramIssueRow">
          <span>Незаполнено</span>
          <span className="diagramIssueChip">{Number(hybridLayerCounts.incomplete || 0)}</span>
        </div>
        <div className="diagramIssueRow">
          <span>Привязки</span>
          <span className="diagramIssueChip">
            {Number(hybridLayerVisibilityStats.validBindings || 0)} ок / {Number(hybridLayerVisibilityStats.missingBindings || 0)} отсутствуют
          </span>
        </div>
        <div className="diagramIssueRow">
          <span>Viewport</span>
          <span className="diagramIssueChip">
            {Number(hybridLayerVisibilityStats.insideViewport || 0)} внутри / {Number(hybridLayerVisibilityStats.outsideViewport || 0)} вне
          </span>
        </div>
      </div>
      {hybridV2ImportNotice ? (
        <div className="diagramActionPopoverEmpty mt-2">{hybridV2ImportNotice}</div>
      ) : null}
      {hybridVisible && Number(hybridLayerVisibilityStats.outsideViewport || 0) > 0 ? (
        <div className="diagramActionPopoverEmpty mt-2" data-testid="diagram-action-layers-outside-warning">
          Часть меток вне viewport. Нажмите «Фокус» или «Перейти».
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
            Очистить отсутствующие привязки ({Number(hybridLayerVisibilityStats.missingBindings || 0)})
          </button>
        </div>
      ) : null}
      {hybridVisible && Number(hybridTotalCount || 0) === 0 ? (
        <div className="diagramActionPopoverEmpty mt-2" data-testid="diagram-action-layers-empty-state">
          Нет элементов Hybrid. Переключись в Edit и кликни по узлу BPMN, чтобы добавить метку.
        </div>
      ) : null}
      <div className="muted mt-2 text-[10px]">Peek: удерживайте <b>H</b> (temporary View)</div>
    </div>
  );
}
