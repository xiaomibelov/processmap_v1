import { useEffect, useMemo, useRef, useState } from "react";

function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

const DEFAULT_ROW_HEIGHT = 76;
const DEFAULT_OVERSCAN = 8;
const ROUTE_COLUMNS_HEIGHT = 34;

export default function PathStepList({
  title = "Маршрут",
  rows = [],
  renderRow = null,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  children,
}) {
  const routeRows = toArray(rows);
  const canVirtualize = typeof renderRow === "function";
  const stackRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);

  useEffect(() => {
    if (!canVirtualize) return undefined;
    const node = stackRef.current;
    if (!node) return undefined;
    const applyHeight = () => {
      const next = Number(node.clientHeight || 560);
      if (Number.isFinite(next) && next > 0) setViewportHeight(next);
    };
    applyHeight();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => applyHeight());
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", applyHeight);
    return () => window.removeEventListener("resize", applyHeight);
  }, [canVirtualize]);

  const virtual = useMemo(() => {
    if (!canVirtualize) return null;
    const safeRowHeight = Math.max(52, Number(rowHeight || DEFAULT_ROW_HEIGHT));
    const safeOverscan = Math.max(2, Number(overscan || DEFAULT_OVERSCAN));
    const total = routeRows.length;
    const start = Math.max(0, Math.floor(scrollTop / safeRowHeight) - safeOverscan);
    const visibleCount = Math.ceil(viewportHeight / safeRowHeight) + safeOverscan * 2;
    const end = Math.min(total, start + visibleCount);
    return {
      rowHeight: safeRowHeight,
      start,
      end,
      totalHeight: total * safeRowHeight,
      rows: routeRows.slice(start, end).map((row, idx) => ({
        index: start + idx,
        row,
      })),
    };
  }, [canVirtualize, routeRows, rowHeight, overscan, scrollTop, viewportHeight]);

  return (
    <div className="interviewPathSteps">
      <div className="interviewPathStepsHead">
        <div className="interviewPathsRailTitle">{toText(title) || "Маршрут"}</div>
      </div>
      <div
        ref={stackRef}
        className="interviewPathsRouteStack"
        data-testid="interview-paths-route-stack"
        data-total-rows={canVirtualize ? routeRows.length : undefined}
        onScroll={(event) => {
          if (!canVirtualize) return;
          setScrollTop(Number(event?.currentTarget?.scrollTop || 0));
        }}
      >
        <div className="interviewPathStepsColumns" role="presentation">
          <span>Шаг</span>
          <span>Lane</span>
          <span>Work</span>
          <span>Wait</span>
          <span>Presets</span>
        </div>
        {canVirtualize ? (
          <div
            className="interviewPathsVirtualViewport"
            style={{ height: `${Number(virtual?.totalHeight || 0) + ROUTE_COLUMNS_HEIGHT}px` }}
          >
            {toArray(virtual?.rows).map((item) => (
              <div
                key={`route_row_virtual_${item.index}_${toText(item?.row?.node_id || item?.row?.id || item.index)}`}
                className="interviewPathsVirtualRow"
                style={{ transform: `translateY(${item.index * Number(virtual?.rowHeight || DEFAULT_ROW_HEIGHT) + ROUTE_COLUMNS_HEIGHT}px)` }}
              >
                {renderRow?.(item.row, item.index)}
              </div>
            ))}
          </div>
        ) : children}
      </div>
    </div>
  );
}
