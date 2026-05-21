import React from "react";
import DiagramSkeleton from "./DiagramSkeleton";

/**
 * Boundary component that controls skeleton, error panel, and canvas
 * visibility based on an explicit load state machine.
 *
 * Props:
 *   loadState      — string from useDiagramLoadStateMachine
 *   errorReason    — last error reason
 *   onRetry        — callback for retry button
 *   children       — canvas container (always keep mounted after first paint)
 */
export default function DiagramLoadBoundary({ loadState, errorReason, onRetry, children }) {
  const isSkeletonVisible = loadState === "initializing" || loadState === "importing";
  const isError = loadState === "error" || loadState === "timeout";
  const isCanvasVisible =
    loadState === "canvas-ready" ||
    loadState === "ready" ||
    loadState === "error" ||
    loadState === "timeout";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {isSkeletonVisible ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <DiagramSkeleton />
        </div>
      ) : null}

      {isError ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 6,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            padding: 24,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Ошибка загрузки диаграммы
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 16 }}>
            {errorReason || "Неизвестная ошибка"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 16 }}>
            Состояние: {loadState}
          </div>
          {typeof onRetry === "function" ? (
            <button
              type="button"
              className="primaryBtn"
              onClick={onRetry}
              data-testid="diagram-retry-btn"
            >
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          opacity: isCanvasVisible ? 1 : 0,
          pointerEvents: isCanvasVisible ? "auto" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
