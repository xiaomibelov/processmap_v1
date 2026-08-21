import React from "react";
import { asArray, asObject, toText } from "./hybridRendererUtils.jsx";

function shouldRenderLegacyCanvasRow(itemRaw) {
  const item = asObject(itemRaw);
  const elementId = toText(item.elementId);
  if (!elementId) return false;
  const loweredId = elementId.toLowerCase();
  const status = toText(item.status).toLowerCase();
  const executor = toText(item.executor);
  const actionKey = toText(item.actionKey);
  const processInfoGhostSignature = loweredId.startsWith("process_")
    && (status === "" || status === "none")
    && !executor
    && !actionKey;
  if (processInfoGhostSignature) return false;
  return true;
}

export default function HybridLegacyRenderer({
  legacyRows,
  legacyActiveElementId,
  mode,
  debugEnabled,
  onLegacyHotspotMouseDown,
  onLegacyHotspotClick,
  onLegacyCardMouseDown,
  onLegacyCardClick,
  onLegacyMissingCleanupMouseDown,
  onLegacyMissingCleanupClick,
  onLegacyCardRef,
}) {
  return (
    <>
      {asArray(legacyRows).map((rowRaw) => {
        const item = asObject(rowRaw);
        if (!shouldRenderLegacyCanvasRow(item)) return null;
        const elementId = toText(item.elementId);
        if (!elementId) return null;
        // Viewport culling: skip mounting DOM nodes for items outside the visible
        // area (with buffer). Active elements are always mounted so their card
        // remains visible even when the hotspot is scrolled off-screen.
        const isActive = toText(legacyActiveElementId) === elementId;
        if (!item.insideViewport && !isActive) return null;
        const posX = Number(item.posX || 0);
        const posY = Number(item.posY || 0);
        const status = toText(item.status).toLowerCase() || "none";
        const showCard = mode === "edit" || isActive;
        const debugOffsetX = Number(item.rawX || 0) - posX;
        const debugOffsetY = Number(item.rawY || 0) - posY;
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
                title={`${elementId}: x=${Math.round(Number(item.rawX || 0))}, y=${Math.round(Number(item.rawY || 0))}`}
              />
            ) : null}
            <button
              type="button"
              className="hybridLayerHotspot"
              title={`Hybrid: ${toText(item.title) || elementId}`}
              data-testid="hybrid-layer-hotspot"
              onMouseDown={(event) => onLegacyHotspotMouseDown?.(event, elementId)}
              onClick={(event) => onLegacyHotspotClick?.(event, elementId)}
            >
              ℹ
            </button>
            {showCard ? (
              <div
                className="hybridLayerCard"
                data-testid="hybrid-layer-card"
                ref={onLegacyCardRef?.(elementId)}
                style={{
                  left: `${Number(item.cardLeft || 0)}px`,
                  top: `${Number(item.cardTop || 0)}px`,
                }}
                onMouseDown={(event) => onLegacyCardMouseDown?.(event, item)}
                onClick={(event) => onLegacyCardClick?.(event, elementId)}
              >
                <div className="hybridLayerCardTitle" title={toText(item.title) || elementId}>
                  {toText(item.title) || elementId}
                </div>
                <div className="hybridLayerCardMeta">
                  <span className={`hybridLayerStatus is-${status}`}>{status}</span>
                  <span className="hybridLayerNodeId">{elementId}</span>
                </div>
                <div className="hybridLayerCardMeta">
                  <span>{toText(item.executor) || "executor:—"}</span>
                  <span>{toText(item.actionKey) || "action:—"}</span>
                </div>
                {!item.hasCenter ? (
                  <div className="hybridLayerCardMeta">
                    <span>binding: missing in current BPMN</span>
                    <button
                      type="button"
                      className="secondaryBtn h-6 px-1.5 text-[10px]"
                      onMouseDown={(event) => onLegacyMissingCleanupMouseDown?.(event, elementId)}
                      onClick={(event) => onLegacyMissingCleanupClick?.(event, elementId)}
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
    </>
  );
}
