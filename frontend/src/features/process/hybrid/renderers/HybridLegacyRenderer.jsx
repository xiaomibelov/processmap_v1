import React from "react";
import { asArray, asObject, toText } from "./hybridRendererUtils.jsx";

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
        const elementId = toText(item.elementId);
        if (!elementId) return null;
        const posX = Number(item.posX || 0);
        const posY = Number(item.posY || 0);
        const status = toText(item.status).toLowerCase() || "none";
        const isActive = toText(legacyActiveElementId) === elementId;
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
