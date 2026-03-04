import React from "react";

function toText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
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
  hybridV2ToolState,
  setHybridV2Tool,
  setHybridLayerOpacity,
  toggleHybridLayerLock,
  toggleHybridLayerFocus,
  hybridV2DocLive,
  hybridV2HiddenCount,
  revealAllHybridV2,
  toggleHybridV2LayerVisibility,
  toggleHybridV2LayerLock,
  setHybridV2LayerOpacity,
  hybridV2ActiveId,
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
  hybridLayerRenderRows,
  hybridV2Renderable,
  setHybridV2ActiveId,
  bpmnRef,
  goToHybridLayerItem,
}) {
  if (!open) return null;
  return (
    <div
      className="diagramActionPopover diagramActionPopover--layers"
      ref={popoverRef}
      data-testid="diagram-action-layers-popover"
      onMouseDown={onMouseDown}
    >
      <div className="diagramActionPopoverHead">
        <span>Layers</span>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>
      <div className="diagramIssueRows">
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
            Focus
          </button>
        </div>
        <div className="diagramIssueRow">
          <span>Mode</span>
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className={`secondaryBtn h-7 px-2 text-[11px] ${hybridModeEffective === "view" ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => setHybridLayerMode("view")}
              data-testid="diagram-action-layers-mode-view"
            >
              View
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
              Edit
            </button>
          </div>
        </div>
        <div className="diagramIssueRow">
          <span>Tool</span>
          <div className="diagramActionPopoverActions mt-0">
            {[
              { id: "select", label: "Select" },
              { id: "rect", label: "Rect" },
              { id: "container", label: "Container" },
              { id: "note", label: "Note" },
              { id: "text", label: "Text" },
              { id: "arrow", label: "Arrow" },
            ].map((tool) => {
              const currentTool = toText(hybridV2ToolState || "select");
              return (
                <button
                  key={`hybrid_v2_tool_${tool.id}`}
                  type="button"
                  className={`secondaryBtn h-7 px-2 text-[11px] ${currentTool === tool.id ? "ring-1 ring-accent/60" : ""}`}
                  onClick={() => setHybridV2Tool(tool.id)}
                  disabled={hybridModeEffective !== "edit" || !!hybridUiPrefs.lock}
                  data-testid={`diagram-action-layers-tool-${tool.id}`}
                >
                  {tool.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="diagramIssueRow">
          <span>Opacity</span>
          <div className="diagramActionPopoverActions mt-0">
            {[100, 60, 30].map((opacity) => (
              <button
                key={`hybrid_opacity_${opacity}`}
                type="button"
                className={`secondaryBtn h-7 px-2 text-[11px] ${Number(hybridUiPrefs.opacity || 0) === opacity ? "ring-1 ring-accent/60" : ""}`}
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
            <span>Lock</span>
          </label>
          <label className="diagramActionCheckboxRow">
            <input
              type="checkbox"
              checked={!!hybridUiPrefs.focus}
              onChange={toggleHybridLayerFocus}
              data-testid="diagram-action-layers-focus"
            />
            <span>Dim BPMN</span>
          </label>
        </div>
        <div className="diagramIssueRow">
          <span>V2</span>
          <span className="diagramIssueChip">
            {Number(asArray(hybridV2DocLive?.elements).length || 0)} elements / {Number(asArray(hybridV2DocLive?.edges).length || 0)} edges
          </span>
        </div>
        <div className="diagramIssueRow">
          <span>Hidden</span>
          <div className="diagramActionPopoverActions mt-0">
            <span className="diagramIssueChip">{Number(hybridV2HiddenCount || 0)}</span>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => revealAllHybridV2("hybrid_v2_reveal_all_button")}
              disabled={Number(hybridV2HiddenCount || 0) <= 0}
              data-testid="diagram-action-layers-reveal-all"
            >
              Reveal all
            </button>
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
                    <span>eye</span>
                  </label>
                  <label className="diagramActionCheckboxRow">
                    <input
                      type="checkbox"
                      checked={layer.locked === true}
                      onChange={() => toggleHybridV2LayerLock(layerId)}
                      data-testid={`diagram-action-layers-layer-lock-${layerId}`}
                    />
                    <span>lock</span>
                  </label>
                  <div className="diagramActionPopoverActions mt-0">
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
              </div>
            );
          })}
        </div>
        <div className="diagramIssueRow">
          <span>Selection</span>
          <span className="diagramIssueChip">{toText(hybridV2ActiveId) || "—"}</span>
        </div>
        <div className="diagramIssueRow">
          <span>Bind</span>
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className={`secondaryBtn h-7 px-2 text-[11px] ${hybridV2BindPickMode ? "ring-1 ring-accent/60" : ""}`}
              onClick={() => setHybridV2BindPickMode((prev) => !prev)}
              disabled={!hybridV2ActiveId || hybridModeEffective !== "edit"}
              data-testid="diagram-action-layers-bind-pick"
            >
              {hybridV2BindPickMode ? "Pick BPMN: ON" : "Bind to BPMN"}
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={goToActiveHybridBinding}
              disabled={!toText(asObject(hybridV2BindingByHybridId[hybridV2ActiveId]).bpmn_id)}
              data-testid="diagram-action-layers-go-bound"
            >
              Go to bound
            </button>
          </div>
        </div>
        <div className="diagramIssueRow">
          <span>Draw.io</span>
          <div className="diagramActionPopoverActions mt-0">
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={exportHybridV2Drawio}
              disabled={!hybridVisible}
              data-testid="diagram-action-layers-export-drawio"
            >
              Export
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={onImportDrawioClick}
              disabled={!hybridVisible}
              data-testid="diagram-action-layers-import-drawio"
            >
              Import
            </button>
          </div>
        </div>
      </div>
      <div className="diagramIssueRows mt-2">
        <div className="diagramIssueRow">
          <span>Ready</span>
          <span className="diagramIssueChip">{Number(hybridLayerCounts.ready || 0)}</span>
        </div>
        <div className="diagramIssueRow">
          <span>Incomplete</span>
          <span className="diagramIssueChip">{Number(hybridLayerCounts.incomplete || 0)}</span>
        </div>
        <div className="diagramIssueRow">
          <span>Bindings</span>
          <span className="diagramIssueChip">
            {Number(hybridLayerVisibilityStats.validBindings || 0)} ok / {Number(hybridLayerVisibilityStats.missingBindings || 0)} missing
          </span>
        </div>
        <div className="diagramIssueRow">
          <span>Viewport</span>
          <span className="diagramIssueChip">
            {Number(hybridLayerVisibilityStats.insideViewport || 0)} in / {Number(hybridLayerVisibilityStats.outsideViewport || 0)} out
          </span>
        </div>
      </div>
      {hybridV2ImportNotice ? (
        <div className="diagramActionPopoverEmpty mt-2">{hybridV2ImportNotice}</div>
      ) : null}
      {hybridVisible && Number(hybridLayerVisibilityStats.outsideViewport || 0) > 0 ? (
        <div className="diagramActionPopoverEmpty mt-2" data-testid="diagram-action-layers-outside-warning">
          Часть меток вне viewport. Нажмите Focus или Go to.
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
            Clean up missing bindings ({Number(hybridLayerVisibilityStats.missingBindings || 0)})
          </button>
        </div>
      ) : null}
      {hybridVisible && Number(hybridTotalCount || 0) === 0 ? (
        <div className="diagramActionPopoverEmpty mt-2" data-testid="diagram-action-layers-empty-state">
          Нет элементов Hybrid. Переключись в Edit и кликни по узлу BPMN, чтобы добавить метку.
        </div>
      ) : null}
      {hybridVisible && Number(hybridTotalCount || 0) > 0 ? (
        <div className="hybridLayerPopoverList mt-2" data-testid="diagram-action-layers-item-list">
          {(hybridLayerRenderRows.length > 0
            ? hybridLayerRenderRows.slice(0, 30).map((rowRaw) => {
              const row = asObject(rowRaw);
              const elementId = toText(row?.elementId);
              const title = toText(row?.title || elementId) || elementId;
              const missing = !row?.hasCenter;
              return {
                key: `legacy_${elementId}`,
                elementId,
                title,
                missing,
                onGoTo: () => goToHybridLayerItem(elementId, "layers_list_go_to"),
              };
            })
            : hybridV2Renderable.elements.slice(0, 40).map((elementRaw) => {
              const element = asObject(elementRaw);
              const elementId = toText(element.id);
              const binding = asObject(hybridV2BindingByHybridId[elementId]);
              const bpmnId = toText(binding.bpmn_id || binding.bpmnId);
              return {
                key: `v2_${elementId}`,
                elementId,
                title: toText(element.text || elementId) || elementId,
                missing: !bpmnId,
                onGoTo: () => {
                  setHybridV2ActiveId(elementId);
                  if (bpmnId) {
                    bpmnRef.current?.focusNode?.(bpmnId, { keepPrevious: false, durationMs: 1200 });
                  }
                },
              };
            })).map((rowRaw) => {
            const row = asObject(rowRaw);
            const elementId = toText(row?.elementId);
            const title = toText(row?.title || elementId) || elementId;
            const missing = !!row?.missing;
            return (
              <div key={toText(row?.key) || `hybrid_layer_row_${elementId}`} className="hybridLayerPopoverRow">
                <div className="hybridLayerPopoverMain">
                  <span className="hybridLayerPopoverTitle" title={title}>{title}</span>
                  <span className="hybridLayerPopoverMeta">{elementId}</span>
                </div>
                <div className="hybridLayerPopoverActions">
                  {missing ? <span className="diagramIssueChip">missing</span> : null}
                  <button
                    type="button"
                    className="secondaryBtn h-7 px-2 text-[11px]"
                    onClick={() => {
                      if (typeof row.onGoTo === "function") row.onGoTo();
                    }}
                    data-testid="diagram-action-layers-go-to"
                  >
                    Go to
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="muted mt-2 text-[10px]">Peek: удерживайте <b>H</b> (temporary View)</div>
    </div>
  );
}
