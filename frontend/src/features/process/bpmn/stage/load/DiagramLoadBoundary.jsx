import React, { useEffect, useState } from "react";
import DiagramSkeleton from "./DiagramSkeleton";

/**
 * FIX-V (блок 3, L1–L3): скелетон показывается только если загрузка длится
 * дольше порога — быстрые загрузки проходят без мерцания. Скрытие мгновенное.
 * Таймер один, CSS-анимации на transform/opacity — влияния на FPS нет.
 */
const SKELETON_REVEAL_DELAY_MS = 400;

/**
 * Boundary component that controls skeleton, error panel, and canvas
 * visibility based on an explicit load state machine.
 *
 * Props:
 *   loadState      — string from useDiagramLoadStateMachine
 *   errorReason    — last error reason
 *   onRetry        — callback for retry button
 *   hasDiagram     — if true, the canvas already has a rendered diagram;
 *                    never block it with an error/timeout overlay.
 *   children       — canvas container (always keep mounted after first paint)
 */
export default function DiagramLoadBoundary({ loadState, errorReason, onRetry, hasDiagram, children }) {
  const isSkeletonVisible = loadState === "initializing" || loadState === "importing";
  const isError = loadState === "error" || loadState === "timeout";

  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(false);
  }, [loadState]);

  // Отложенное появление скелетона (анти-мерцание на быстрых загрузках).
  const [skeletonRevealed, setSkeletonRevealed] = useState(false);
  useEffect(() => {
    if (!isSkeletonVisible) {
      setSkeletonRevealed(false);
      return undefined;
    }
    if (typeof window === "undefined") {
      setSkeletonRevealed(true);
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      setSkeletonRevealed(true);
    }, SKELETON_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timerId);
  }, [isSkeletonVisible]);
  const showSkeleton = isSkeletonVisible && skeletonRevealed;

  // If the diagram is already rendered, the overlay is never useful.
  const isErrorVisible = isError && !hasDiagram && !dismissed;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {showSkeleton ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          data-testid="diagram-skeleton-overlay"
        >
          <DiagramSkeleton />
        </div>
      ) : null}

      {isErrorVisible ? (
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
          <div style={{ display: "flex", gap: 12 }}>
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
            <button
              type="button"
              className="primaryBtn"
              onClick={() => setDismissed(true)}
              data-testid="diagram-close-overlay-btn"
            >
              Закрыть / Продолжить работу
            </button>
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          opacity: 1,
          pointerEvents: showSkeleton || isErrorVisible ? "none" : "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}
