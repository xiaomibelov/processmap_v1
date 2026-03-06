import React from "react";
import { asArray, asObject } from "./hybridRendererUtils.jsx";
import HybridEdgesRenderer from "./HybridEdgesRenderer.jsx";
import HybridElementsRenderer from "./HybridElementsRenderer.jsx";
import HybridGhostRenderer from "./HybridGhostRenderer.jsx";
import HybridSelectionRenderer from "./HybridSelectionRenderer.jsx";
import HybridLegacyRenderer from "./HybridLegacyRenderer.jsx";

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
  placementHitLayerActive,
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
  const renderable = asObject(v2Renderable);
  const mode = String(modeEffective || "view");
  const textEditor = asObject(v2TextEditor);
  const hasTextEditor = !!textEditor.id;

  return (
    <div
      className={`hybridLayerOverlay ${mode === "edit" ? "isEdit" : "isView"}`}
      ref={overlayRef}
      style={{
        "--hybrid-layer-opacity": String(Math.max(0.2, Math.min(1, opacityValue))),
        pointerEvents: "none",
      }}
      data-testid="hybrid-layer-overlay"
      tabIndex={-1}
    >
      <div className="sr-only" data-testid="hybrid-overlay-root" />
      {mode === "edit" && !uiPrefs?.lock ? (
        <div className="hybridLayerShield" />
      ) : null}
      {placementHitLayerActive ? (
        <div
          className="hybridPlacementHitLayer"
          data-testid="hybrid-placement-hit-layer"
          onPointerDown={onOverlayPointerDown}
          onPointerMove={onOverlayPointerMove}
          onMouseMove={onOverlayPointerMove}
          onPointerLeave={onOverlayPointerLeave}
          onMouseLeave={onOverlayPointerLeave}
          onContextMenu={onOverlayContextMenu}
        />
      ) : null}
      <svg
        className={`hybridV2Svg ${mode === "edit" ? "isEdit" : "isView"}`}
        data-testid="hybrid-v2-svg"
        style={{ pointerEvents: "none" }}
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

        <HybridEdgesRenderer
          edges={renderable.edges}
          activeId={v2ActiveId}
          selectedIds={v2SelectedIds}
          highlightedIds={v2PlaybackHighlightedIds}
          onElementPointerDown={onV2ElementPointerDown}
          onElementContextMenu={onV2ElementContextMenu}
        />

        <HybridElementsRenderer
          elements={renderable.elements}
          activeId={v2ActiveId}
          selectedIds={v2SelectedIds}
          highlightedIds={v2PlaybackHighlightedIds}
          bindingByHybridId={v2BindingByHybridId}
          onElementPointerDown={onV2ElementPointerDown}
          onElementContextMenu={onV2ElementContextMenu}
          onElementDoubleClick={onV2ElementDoubleClick}
        />

        <HybridSelectionRenderer
          mode={mode}
          elements={renderable.elements}
          activeId={v2ActiveId}
          selectedIds={v2SelectedIds}
          onHandlePointerDown={onV2ResizeHandlePointerDown}
        />

        <HybridGhostRenderer
          ghost={v2GhostPreview}
          arrowPreview={v2ArrowPreview}
        />
      </svg>

      {hasTextEditor ? (
        <div
          className="absolute"
          style={{
            left: `${Math.round(Number(textEditor.left || 0))}px`,
            top: `${Math.round(Number(textEditor.top || 0))}px`,
            width: `${Math.max(140, Math.round(Number(textEditor.width || 0)))}px`,
            minHeight: `${Math.max(44, Math.round(Number(textEditor.height || 0)))}px`,
            zIndex: 12,
          }}
          data-testid="hybrid-v2-text-editor-shell"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <textarea
            className="input w-full resize-none rounded-lg border border-accent/50 bg-panel px-2 py-1 text-sm text-fg shadow-lg outline-none"
            value={String(textEditor.value ?? "")}
            autoFocus
            spellCheck={false}
            rows={Math.max(2, Math.ceil(Number(textEditor.height || 44) / 24))}
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

      <HybridLegacyRenderer
        legacyRows={asArray(legacyRows)}
        legacyActiveElementId={legacyActiveElementId}
        mode={mode}
        debugEnabled={debugEnabled}
        onLegacyHotspotMouseDown={onLegacyHotspotMouseDown}
        onLegacyHotspotClick={onLegacyHotspotClick}
        onLegacyCardMouseDown={onLegacyCardMouseDown}
        onLegacyCardClick={onLegacyCardClick}
        onLegacyMissingCleanupMouseDown={onLegacyMissingCleanupMouseDown}
        onLegacyMissingCleanupClick={onLegacyMissingCleanupClick}
        onLegacyCardRef={onLegacyCardRef}
      />
    </div>
  );
}
