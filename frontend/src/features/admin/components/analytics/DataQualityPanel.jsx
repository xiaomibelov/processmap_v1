import SectionCard from "../common/SectionCard";

function QualityRow({ label, value, hint = "", danger = false }) {
  return (
    <div className={`rounded-lg border p-3 ${danger ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

// Data quality counters from the summary payload (all computed server-side).
export default function DataQualityPanel({ dataQuality = {}, generatedAt = 0, onRefresh }) {
  const quality = dataQuality && typeof dataQuality === "object" ? dataQuality : {};
  return (
    <SectionCard
      title="Качество данных"
      subtitle={generatedAt ? `Снимок от ${new Date(Number(generatedAt) * 1000).toLocaleString("ru-RU")}` : ""}
      eyebrow="Data quality"
      action={(
        <button
          type="button"
          className="secondaryBtn h-7 min-h-0 rounded-lg px-3 py-0 text-xs"
          onClick={() => onRefresh?.()}
          data-testid="analytics-refresh"
        >
          Обновить данные
        </button>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="analytics-quality-panel">
        <QualityRow label="Пустой BPMN XML" value={quality.empty_xml ?? 0} danger={Number(quality.empty_xml) > 0} />
        <QualityRow label="Сессии без автора" value={quality.orphan_created_by ?? 0} danger={Number(quality.orphan_created_by) > 0} />
        <QualityRow label="created > updated" value={quality.created_gt_updated ?? 0} danger={Number(quality.created_gt_updated) > 0} />
        <QualityRow
          label="Без истории версий"
          value={quality.no_versions ?? 0}
          hint={`${quality.no_versions_pct ?? 0}% сессий`}
        />
      </div>
    </SectionCard>
  );
}
