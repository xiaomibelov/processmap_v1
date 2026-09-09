import React, { useEffect, useRef, useState } from "react";
import FlowArcSpinner from "./FlowArcSpinner";
import {
  createLowFpsGuardState,
  reduceLowFpsGuardState,
} from "./lowFpsGuardModel";
import "./LowFpsCanvasGuard.css";

const SAMPLE_WINDOW_MS = 1000;

export default function LowFpsCanvasGuard({ enabled = true }) {
  const [active, setActive] = useState(false);
  const stateRef = useRef(createLowFpsGuardState());

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      stateRef.current = createLowFpsGuardState();
      setActive(false);
      return undefined;
    }

    let frameCount = 0;
    let rafId = 0;
    let windowStartedAt = performance.now();
    const tick = () => {
      frameCount += 1;
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.max(1, now - windowStartedAt);
      if (document.visibilityState === "hidden") {
        stateRef.current = createLowFpsGuardState();
        setActive(false);
      } else {
        const fps = (frameCount * 1000) / elapsed;
        const next = reduceLowFpsGuardState(stateRef.current, fps);
        stateRef.current = next;
        setActive((current) => (current === next.active ? current : next.active));
      }
      frameCount = 0;
      windowStartedAt = now;
    }, SAMPLE_WINDOW_MS);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearInterval(intervalId);
    };
  }, [enabled]);

  if (!active) return null;

  return (
    <div
      className="lowFpsCanvasGuard"
      data-testid="low-fps-canvas-guard"
      aria-label="Схема восстанавливает отзывчивость"
    >
      <FlowArcSpinner size={36} label="Схема восстанавливает отзывчивость" />
    </div>
  );
}
