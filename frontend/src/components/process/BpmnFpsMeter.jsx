import { useEffect, useRef, useState } from "react";
import { getPanProfiler, maybeStartPanProfilerFromUrl } from "../../features/process/bpmn/stage/profiling/panProfiler";

function useFpsMetrics() {
  const [metrics, setMetrics] = useState({ fps: 0, ms: 0, minMs: 0, maxMs: 0, drops: 0 });
  const framesRef = useRef(0);
  const timesRef = useRef([]);
  const lastRef = useRef(performance.now());
  const rafRef = useRef(0);

  useEffect(() => {
    const tick = (now) => {
      const dt = now - lastRef.current;
      lastRef.current = now;
      framesRef.current += 1;
      timesRef.current.push(dt);
      if (timesRef.current.length > 120) timesRef.current.shift();

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastRef.current + framesRef.current * 16; // approx
      const fps = framesRef.current;
      const times = timesRef.current;
      const avgMs = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      const minMs = times.length ? Math.min(...times) : 0;
      const maxMs = times.length ? Math.max(...times) : 0;
      const drops = times.filter((t) => t > 32).length;
      setMetrics({ fps, ms: Math.round(avgMs * 10) / 10, minMs: Math.round(minMs * 10) / 10, maxMs: Math.round(maxMs * 10) / 10, drops });
      framesRef.current = 0;
      timesRef.current = [];
    }, 1000);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(interval);
    };
  }, []);

  return metrics;
}

function useProfilerStatus() {
  const [active, setActive] = useState(false);
  const [summary, setSummary] = useState(null);
  const intervalRef = useRef(0);

  useEffect(() => {
    maybeStartPanProfilerFromUrl();
    const p = getPanProfiler();
    intervalRef.current = window.setInterval(() => {
      setActive(p.active);
      if (!p.active && window.__fpcPanProfileSummary && window.__fpcPanProfileSummary !== summary) {
        setSummary(window.__fpcPanProfileSummary);
      }
    }, 500);
    return () => window.clearInterval(intervalRef.current);
  }, [summary]);

  return { active, summary, setSummary };
}

export default function BpmnFpsMeter({ enabled = true }) {
  const { fps, ms, minMs, maxMs, drops } = useFpsMetrics();
  const { active, summary, setSummary } = useProfilerStatus();
  if (!enabled) return null;

  const color = fps >= 55 ? "#22c55e" : fps >= 30 ? "#eab308" : "#ef4444";
  const profiler = getPanProfiler();

  const toggleProfiler = () => {
    if (profiler.active) {
      profiler.stop();
      if (window.__fpcPanProfileSummary) {
        setSummary(window.__fpcPanProfileSummary);
      }
    } else {
      profiler.start();
      setSummary(null);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        zIndex: 10,
        background: "#f97316",
        border: "1px solid #fb923c",
        color: "#fff",
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: "1.4",
        padding: "8px 10px",
        borderRadius: 6,
        pointerEvents: "auto",
        userSelect: "none",
        minWidth: 160,
        maxWidth: 420,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color }}>{fps} FPS</span>
        <span style={{ opacity: 0.6 }}>{ms} ms</span>
        <button
          onClick={toggleProfiler}
          style={{
            marginLeft: "auto",
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.3)",
            background: active ? "#ef4444" : "#22c55e",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {active ? "Stop Profile" : "Profile Pan"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 10, opacity: 0.7 }}>
        <span>min {minMs}</span>
        <span>max {maxMs}</span>
        <span style={{ color: drops > 0 ? "#ef4444" : "inherit" }}>drops {drops}</span>
      </div>
      {active && (
        <div style={{ marginTop: 2, fontSize: 10, color: "#93c5fd" }}>
          Profiling…
        </div>
      )}
    </div>
  );
}
