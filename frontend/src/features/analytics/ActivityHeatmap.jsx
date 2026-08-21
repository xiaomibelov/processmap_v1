import { colorForIndex } from "./AnalyticsDonutChart.jsx";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function HeatmapRow({ title, items, testId }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="activityHeatmapGroup" data-testid={testId}>
      <h4 className="activityHeatmapGroupTitle">{title}</h4>
      <div className="activityHeatmapCells">
        {items.map((item, idx) => (
          <div key={idx} className="activityHeatmapCell" title={`${item.label} — ${item.value}`}>
            <span className="activityHeatmapValue">{item.value}</span>
            <div
              className="activityHeatmapBar"
              style={{
                height: item.value ? Math.max(4, (item.value / max) * 32) : 0,
                background: item.color,
              }}
            />
            <span className="activityHeatmapLabel">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ActivityHeatmap({ byHour = [], byWeekday = [] }) {
  const hourItems = byHour.map((value, idx) => ({
    label: `${idx}`,
    value: Number(value) || 0,
    color: colorForIndex(idx),
  }));
  const dayItems = byWeekday.map((value, idx) => ({
    label: WEEKDAY_LABELS[idx] || `${idx}`,
    value: Number(value) || 0,
    color: colorForIndex(idx),
  }));

  return (
    <div className="activityHeatmap" data-testid="activity-heatmap">
      <HeatmapRow title="По часам" items={hourItems} testId="activity-heatmap-hours" />
      <HeatmapRow title="По дням недели" items={dayItems} testId="activity-heatmap-weekdays" />
    </div>
  );
}
