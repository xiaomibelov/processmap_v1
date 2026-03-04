import React from "react";
import { canResizeHybridElement } from "../../hybrid/tools/hybridTransforms.js";

function toText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function renderTextLines(textRaw, x, y, lineHeight) {
  const lines = String(textRaw || "").split(/\r?\n/);
  return lines.map((line, idx) => (
    <tspan key={`line_${idx}`} x={x} dy={idx === 0 ? 0 : lineHeight}>
      {line || " "}
    </tspan>
  ));
}

export default function HybridOverlayRenderer({
  visible,
  modeEffective,
  uiPrefs,
  opacityValue,
  overlayRef,
  onOverlayPointerDown,
  onOverlayPointerMove,
  onOverlayPointerLeave,
  onOverlayContextMenu,
  v2Renderable,
  v2ActiveId,
  v2SelectedIds,
  v2PlaybackHighlightedIds,
  v2BindingByHybridId,
  onV2ElementPointerDown,
  onV2ElementContextMenu,
  onV2ElementDoubleClick,
  onV2ResizeHandlePointerDown,
  v2GhostPreview,
  v2ArrowPreview,
  v2TextEditor,
  onV2TextEditorChange,
  onV2TextEditorCommit,
  onV2TextEditorCancel,
  legacyRows,
  legacyActiveElementId,
  debugEnabled,
  onLegacyHotspotMouseDown,
  onLegacyHotspotClick,
  onLegacyCardMouseDown,
  onLegacyCardClick,
  onLegacyMissingCleanupMouseDown,
  onLegacyMissingCleanupClick,
  onLegacyCardRef,
}) {
  if (!visible) return null;
  return (
    <div
      className={`hybridLayerOverlay ${modeEffective === "edit" ? "isEdit" : "isView"}`}
      ref={overlayRef}
      style={{ "--hybrid-layer-opacity": String(Math.max(0.2, Math.min(1, opacityValue))) }}
      data-testid="hybrid-layer-overlay"
      tabIndex={-1}
      onMouseDown={onOverlayPointerDown}
      onMouseMove={onOverlayPointerMove}
      onMouseLeave={onOverlayPointerLeave}
      onContextMenu={onOverlayContextMenu}
    >
      {modeEffective === "edit" && !uiPrefs.lock ? (
        <div
          className="hybridLayerShield"
        />
      ) : null}
      <svg
        className={`hybridV2Svg ${modeEffective === "edit" ? "isEdit" : "isView"}`}
        data-testid="hybrid-v2-svg"
        onMouseDown={onOverlayPointerDown}
      >
        <defs>
          <marker
            id="hybridV2ArrowHead"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L7,3.5 L0,7 z" fill="#2563eb" />
          </marker>
        </defs>
        {asArray(v2Renderable?.edges).map((edgeRaw) => {
          const edge = asObject(edgeRaw);
          const edgeId = toText(edge.id);
          const active = toText(v2ActiveId) === edgeId || !!v2SelectedIds?.has?.(edgeId);
          const highlighted = v2PlaybackHighlightedIds?.has?.(edgeId);
          const style = asObject(edge.style);
          const stroke = toText(style.stroke) || "#2563eb";
          const width = Number(style.width || 2);
          const layerOpacity = Math.max(0.1, Math.min(1, Number(edge.layerOpacity || 1)));
          return (
            <path
              key={`hybrid_v2_edge_${edgeId}`}
              className={`hybridV2Edge ${active ? "isActive" : ""} ${highlighted ? "isPlayback" : ""}`}
              d={toText(edge.d)}
              stroke={stroke}
              strokeWidth={width}
              fill="none"
              markerEnd="url(#hybridV2ArrowHead)"
              style={{ opacity: layerOpacity }}
              data-hybrid-element-id={edgeId}
              data-selected={active ? "true" : "false"}
              data-testid="hybrid-v2-edge"
              onMouseDown={(event) => onV2ElementPointerDown(event, edgeId)}
              onContextMenu={(event) => onV2ElementContextMenu(event, edgeId)}
            />
          );
        })}
        {asArray(v2Renderable?.elements).map((elementRaw) => {
          const element = asObject(elementRaw);
          const elementId = toText(element.id);
          const active = toText(v2ActiveId) === elementId || !!v2SelectedIds?.has?.(elementId);
          const highlighted = v2PlaybackHighlightedIds?.has?.(elementId);
          const binding = asObject(v2BindingByHybridId?.[elementId]);
          const style = asObject(element.style);
          const x = Number(element.left || 0);
          const y = Number(element.top || 0);
          const w = Number(element.width || 0);
          const h = Number(element.height || 0);
          const radius = Math.max(2, Number(style.radius || 8) * Number(element.scaleX || 1));
          const fontSize = Math.max(10, Number(style.fontSize || 12) * Math.min(Number(element.scaleX || 1), Number(element.scaleY || 1)));
          const layerOpacity = Math.max(0.1, Math.min(1, Number(element.layerOpacity || 1)));
          const isContainer = element.is_container === true || toText(element.type) === "container";
          const isLocked = asObject(element.layer).locked === true;
          const canResize = canResizeHybridElement(element.type) && !isLocked;
          return (
            <g
              key={`hybrid_v2_element_${elementId}`}
              className={`hybridV2Shape ${active ? "isActive" : ""} ${highlighted ? "isPlayback" : ""} ${isLocked ? "isLocked" : ""}`}
              style={{ opacity: layerOpacity }}
              data-hybrid-element-id={elementId}
              data-selected={active ? "true" : "false"}
              data-locked={isLocked ? "true" : "false"}
              data-testid="hybrid-v2-shape"
              onMouseDown={(event) => onV2ElementPointerDown(event, elementId)}
              onContextMenu={(event) => onV2ElementContextMenu(event, elementId)}
              onDoubleClick={(event) => onV2ElementDoubleClick(event, elementId)}
            >
              <title>{isLocked ? "Locked" : (toText(element.text) || elementId)}</title>
              {active ? (
                <rect
                  x={x - 4}
                  y={y - 4}
                  width={w + 8}
                  height={h + 8}
                  rx={Math.max(4, radius + 2)}
                  ry={Math.max(4, radius + 2)}
                  className={`hybridV2SelectionOutline ${isLocked ? "isLocked" : ""}`}
                  pointerEvents="none"
                  data-testid="hybrid-v2-selection-outline"
                />
              ) : null}
              {toText(element.type) === "text" ? (
                <text
                  x={x + 6}
                  y={y + Math.max(16, h / 2)}
                  fill={toText(style.stroke) || "#334155"}
                  fontSize={fontSize}
                >
                  {renderTextLines(toText(element.text) || "Text", x + 6, y + Math.max(16, h / 2), Math.max(14, fontSize + 2))}
                </text>
              ) : (
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={radius}
                  ry={radius}
                  fill={toText(style.fill) || (toText(element.type) === "note" ? "#fff7d6" : "#f8fafc")}
                  stroke={toText(style.stroke) || "#334155"}
                  strokeWidth={isContainer ? 1.8 : 1.4}
                />
              )}
              {isContainer ? (
                <line
                  x1={x}
                  y1={y + Math.max(18, 24 * Number(element.scaleY || 1))}
                  x2={x + w}
                  y2={y + Math.max(18, 24 * Number(element.scaleY || 1))}
                  stroke={toText(style.stroke) || "#334155"}
                  strokeWidth={1.2}
                />
              ) : null}
              {toText(element.type) !== "text" ? (
                <text
                  x={x + 8}
                  y={y + 20}
                  fill="#0f172a"
                  fontSize={fontSize}
                >
                  {renderTextLines(toText(element.text) || "", x + 8, y + 20, Math.max(14, fontSize + 2))}
                </text>
              ) : null}
              {toText(binding.bpmn_id || "") ? (
                <text
                  x={x + w - 10}
                  y={y + 14}
                  textAnchor="end"
                  className="hybridV2BindingBadge"
                >
                  🔗
                </text>
              ) : null}
              {modeEffective === "edit" && active && canResize ? (
                <>
                  {[
                    { id: "nw", hx: x, hy: y },
                    { id: "ne", hx: x + w, hy: y },
                    { id: "sw", hx: x, hy: y + h },
                    { id: "se", hx: x + w, hy: y + h },
                  ].map((handle) => (
                    <rect
                      key={`hybrid_v2_handle_${elementId}_${handle.id}`}
                      x={handle.hx - 4}
                      y={handle.hy - 4}
                      width={8}
                      height={8}
                      className="hybridV2ResizeHandle"
                      data-hybrid-element-id={elementId}
                      data-handle={handle.id}
                      data-testid="hybrid-v2-resize-handle"
                      onMouseDown={(event) => onV2ResizeHandlePointerDown(event, elementId, handle.id)}
                    />
                  ))}
                </>
              ) : null}
            </g>
          );
        })}
        {v2GhostPreview ? (
          <rect
            x={Number(v2GhostPreview.left || 0)}
            y={Number(v2GhostPreview.top || 0)}
            width={Number(v2GhostPreview.width || 0)}
            height={Number(v2GhostPreview.height || 0)}
            rx="8"
            ry="8"
            fill="rgba(37,99,235,0.08)"
            stroke="#2563eb"
            strokeDasharray="6 4"
            pointerEvents="none"
            data-testid="hybrid-v2-ghost"
          />
        ) : null}
        {v2ArrowPreview ? (
          <line
            x1={Number(v2ArrowPreview.x1 || 0)}
            y1={Number(v2ArrowPreview.y1 || 0)}
            x2={Number(v2ArrowPreview.x2 || 0)}
            y2={Number(v2ArrowPreview.y2 || 0)}
            stroke="#2563eb"
            strokeWidth="2"
            strokeDasharray="6 4"
            pointerEvents="none"
            data-testid="hybrid-v2-arrow-preview"
          />
        ) : null}
      </svg>
      {v2TextEditor ? (
        <div
          className="absolute"
          style={{
            left: `${Math.round(Number(v2TextEditor.left || 0))}px`,
            top: `${Math.round(Number(v2TextEditor.top || 0))}px`,
            width: `${Math.max(140, Math.round(Number(v2TextEditor.width || 0)))}px`,
            minHeight: `${Math.max(44, Math.round(Number(v2TextEditor.height || 0)))}px`,
            zIndex: 12,
          }}
          data-testid="hybrid-v2-text-editor-shell"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <textarea
            className="input w-full resize-none rounded-lg border border-accent/50 bg-panel px-2 py-1 text-sm text-fg shadow-lg outline-none"
            value={String(v2TextEditor.value ?? "")}
            autoFocus
            spellCheck={false}
            rows={Math.max(2, Math.ceil(Number(v2TextEditor.height || 44) / 24))}
            onChange={(event) => onV2TextEditorChange?.(event.target.value)}
            onBlur={() => onV2TextEditorCommit?.("hybrid_v2_text_blur")}
            onKeyDown={(event) => {
              if (String(event.key || "") === "Escape") {
                event.preventDefault();
                onV2TextEditorCancel?.();
                return;
              }
              if (String(event.key || "") === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onV2TextEditorCommit?.("hybrid_v2_text_enter");
              }
            }}
            data-testid="hybrid-v2-text-editor"
          />
        </div>
      ) : null}
      {asArray(legacyRows).map((rowRaw) => {
        const item = asObject(rowRaw);
        const elementId = toText(item?.elementId);
        if (!elementId) return null;
        const posX = Number(item?.posX || 0);
        const posY = Number(item?.posY || 0);
        const status = toText(item?.status).toLowerCase() || "none";
        const isActive = toText(legacyActiveElementId) === elementId;
        const showCard = modeEffective === "edit" || isActive;
        const debugOffsetX = Number(item?.rawX || 0) - posX;
        const debugOffsetY = Number(item?.rawY || 0) - posY;
        return (
          <div
            key={`hybrid_layer_item_${elementId}`}
            className={`hybridLayerItem is-${status} ${showCard ? "isActive" : ""}`}
            style={{ left: `${posX}px`, top: `${posY}px` }}
            data-element-id={elementId}
          >
            {debugEnabled ? (
              <span
                className="hybridLayerDebugCross"
                style={{ left: `${debugOffsetX}px`, top: `${debugOffsetY}px` }}
                title={`${elementId}: x=${Math.round(Number(item?.rawX || 0))}, y=${Math.round(Number(item?.rawY || 0))}`}
              />
            ) : null}
            <button
              type="button"
              className="hybridLayerHotspot"
              title={`Hybrid: ${toText(item?.title) || elementId}`}
              data-testid="hybrid-layer-hotspot"
              onMouseDown={(event) => onLegacyHotspotMouseDown(event, elementId)}
              onClick={(event) => onLegacyHotspotClick(event, elementId)}
            >
              ℹ
            </button>
            {showCard ? (
              <div
                className="hybridLayerCard"
                data-testid="hybrid-layer-card"
                ref={onLegacyCardRef(elementId)}
                style={{
                  left: `${Number(item?.cardLeft || 0)}px`,
                  top: `${Number(item?.cardTop || 0)}px`,
                }}
                onMouseDown={(event) => onLegacyCardMouseDown(event, item)}
                onClick={(event) => onLegacyCardClick(event, elementId)}
              >
                <div className="hybridLayerCardTitle" title={toText(item?.title) || elementId}>
                  {toText(item?.title) || elementId}
                </div>
                <div className="hybridLayerCardMeta">
                  <span className={`hybridLayerStatus is-${status}`}>{status}</span>
                  <span className="hybridLayerNodeId">{elementId}</span>
                </div>
                <div className="hybridLayerCardMeta">
                  <span>{toText(item?.executor) || "executor:—"}</span>
                  <span>{toText(item?.actionKey) || "action:—"}</span>
                </div>
                {!item?.hasCenter ? (
                  <div className="hybridLayerCardMeta">
                    <span>binding: missing in current BPMN</span>
                    <button
                      type="button"
                      className="secondaryBtn h-6 px-1.5 text-[10px]"
                      onMouseDown={(event) => onLegacyMissingCleanupMouseDown(event, elementId)}
                      onClick={(event) => onLegacyMissingCleanupClick(event, elementId)}
                    >
                      Clean
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
