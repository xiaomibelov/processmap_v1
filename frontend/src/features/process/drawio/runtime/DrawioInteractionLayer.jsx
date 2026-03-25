import React from "react";

import DrawioRichTextEditor from "./DrawioRichTextEditor.jsx";
import {
  buildResizeHandleSpecs,
  getResizeHandleCursor,
} from "./useDrawioCanvasInteractionExtras.js";

function DrawioResizeHandlesLayer({
  selectedBbox,
  resizeDraft,
  inlineEdit,
  startResizeDrag,
}) {
  if (!selectedBbox?.hasResize || inlineEdit) return null;
  const handles = buildResizeHandleSpecs({
    x: selectedBbox.screenLeft,
    y: selectedBbox.screenTop,
    width: resizeDraft
      ? Math.round(resizeDraft.width * (selectedBbox.screenWidth / Math.max(1, selectedBbox.width)))
      : selectedBbox.screenWidth,
    height: resizeDraft
      ? Math.round(resizeDraft.height * (selectedBbox.screenHeight / Math.max(1, selectedBbox.height)))
      : selectedBbox.screenHeight,
  });
  const handleSize = 8;
  const handleRadius = 1.5;
  const strokeWidth = 1.5;
  const previewWidth = resizeDraft
    ? Math.round(resizeDraft.width * (selectedBbox.screenWidth / Math.max(1, selectedBbox.width)))
    : selectedBbox.screenWidth;
  const previewHeight = resizeDraft
    ? Math.round(resizeDraft.height * (selectedBbox.screenHeight / Math.max(1, selectedBbox.height)))
    : selectedBbox.screenHeight;
  return (
    <svg
      className="drawioInteractionLayer absolute inset-0"
      width="100%"
      height="100%"
      style={{ pointerEvents: "none", overflow: "visible" }}
      data-testid="drawio-interaction-layer"
    >
      {resizeDraft ? (
        <rect
          x={selectedBbox.screenLeft}
          y={selectedBbox.screenTop}
          width={previewWidth}
          height={previewHeight}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={strokeWidth}
          strokeDasharray="5 3"
          style={{ pointerEvents: "none" }}
        />
      ) : null}
      {handles.map(({ id, cx, cy }) => (
        <rect
          key={id}
          x={cx - handleSize / 2}
          y={cy - handleSize / 2}
          width={handleSize}
          height={handleSize}
          rx={handleRadius}
          fill="white"
          stroke="#3b82f6"
          strokeWidth={strokeWidth}
          data-drawio-resize-handle={id}
          style={{
            pointerEvents: "all",
            cursor: getResizeHandleCursor(id),
          }}
          onPointerDown={(event) => startResizeDrag(event, id)}
        />
      ))}
    </svg>
  );
}

export default function DrawioInteractionLayer({
  selectedBbox,
  resizeDraft,
  inlineEdit,
  startResizeDrag,
  commitInlineText,
  cancelInlineEdit,
}) {
  if (!selectedBbox?.hasResize && !inlineEdit) return null;
  return (
    <div
      className="drawioInteractionLayer absolute inset-0"
      style={{ pointerEvents: "none", zIndex: 6 }}
      data-testid="drawio-interaction-layer-root"
    >
      <DrawioResizeHandlesLayer
        selectedBbox={selectedBbox}
        resizeDraft={resizeDraft}
        inlineEdit={inlineEdit}
        startResizeDrag={startResizeDrag}
      />
      {inlineEdit ? (
        <DrawioRichTextEditor
          inlineEdit={inlineEdit}
          onCommit={commitInlineText}
          onCancel={cancelInlineEdit}
        />
      ) : null}
    </div>
  );
}
