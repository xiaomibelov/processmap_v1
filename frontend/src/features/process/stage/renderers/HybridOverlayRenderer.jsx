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

export default function HybridOverlayRenderer({
  visible,
  modeEffective,
  uiPrefs,
  opacityValue,
  overlayRef,
  onOverlayPointerDown,
  v2Renderable,
  v2ActiveId,
  v2PlaybackHighlightedIds,
  v2BindingByHybridId,
  onV2ElementPointerDown,
  onV2ResizeHandlePointerDown,
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
      onMouseDown={onOverlayPointerDown}
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
          const active = toText(v2ActiveId) === edgeId;
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
              data-testid="hybrid-v2-edge"
              onMouseDown={(event) => onV2ElementPointerDown(event, edgeId)}
            />
          );
        })}
        {asArray(v2Renderable?.elements).map((elementRaw) => {
          const element = asObject(elementRaw);
          const elementId = toText(element.id);
          const active = toText(v2ActiveId) === elementId;
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
          return (
            <g
              key={`hybrid_v2_element_${elementId}`}
              className={`hybridV2Shape ${active ? "isActive" : ""} ${highlighted ? "isPlayback" : ""}`}
              style={{ opacity: layerOpacity }}
              data-hybrid-element-id={elementId}
              data-testid="hybrid-v2-shape"
              onMouseDown={(event) => onV2ElementPointerDown(event, elementId)}
            >
              {toText(element.type) === "text" ? (
                <text
                  x={x + 6}
                  y={y + Math.max(16, h / 2)}
                  fill={toText(style.stroke) || "#334155"}
                  fontSize={fontSize}
                >
                  {toText(element.text) || "Text"}
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
                  {toText(element.text) || ""}
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
              {modeEffective === "edit" && active ? (
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
                      onMouseDown={(event) => onV2ResizeHandlePointerDown(event, elementId, handle.id)}
                    />
                  ))}
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
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
