import { analyticsColorForLabel, computeBarHeights } from "./analyticsColorModel";

const BAR_SLOT = 64;
const BAR_WIDTH = 40;
const CHART_HEIGHT = 176;
const PLOT_HEIGHT = 120;

// Shared SVG bar chart for server-provided distribution bins. Bar heights
// are the only derived value (normalized to the max count); counts and
// percentages are rendered straight from the payload.
export default function DistributionChart({ bins = [], testId = "analytics-distribution-chart" }) {
  const list = Array.isArray(bins) ? bins : [];
  if (list.length === 0) {
    return <div className="text-xs text-slate-500">Нет данных</div>;
  }
  const heights = computeBarHeights(list, PLOT_HEIGHT);
  const width = list.length * BAR_SLOT;
  return (
    <svg
      viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
      className="h-44 w-full"
      role="img"
      data-testid={testId}
    >
      {list.map((row, idx) => {
        const x = idx * BAR_SLOT + (BAR_SLOT - BAR_WIDTH) / 2;
        const height = Math.max(row.count > 0 ? 2 : 0, heights[idx]);
        const y = PLOT_HEIGHT + 8 - height;
        const center = idx * BAR_SLOT + BAR_SLOT / 2;
        return (
          <g key={`${row.bin}_${idx}`} data-testid={`${testId}-bar-${idx}`}>
            <rect x={x} y={y} width={BAR_WIDTH} height={height} rx={3} fill={analyticsColorForLabel(row.color_label)} />
            <text x={center} y={y - 4} textAnchor="middle" fontSize="10" fill="#0f172a">
              {row.count}
            </text>
            <text x={center} y={PLOT_HEIGHT + 22} textAnchor="middle" fontSize="9" fill="#475569">
              {row.bin}
            </text>
            <text x={center} y={PLOT_HEIGHT + 34} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {`${row.percentage}%`}
            </text>
          </g>
        );
      })}
      <line x1="0" y1={PLOT_HEIGHT + 8} x2={width} y2={PLOT_HEIGHT + 8} stroke="#e2e8f0" strokeWidth="1" />
    </svg>
  );
}
