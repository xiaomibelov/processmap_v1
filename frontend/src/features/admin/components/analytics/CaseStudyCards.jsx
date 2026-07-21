import SectionCard from "../common/SectionCard";
import { formatDateRu, formatDurationSeconds } from "./analyticsFormat";

function timelinePointLabel(index, total) {
  if (index === 0) return "первая версия";
  if (index === total - 1) return "последняя";
  return "точка изменений";
}

// Case studies: top sessions by version count with a compressed timeline of
// change points (compressed server-side; rendered as-is).
export default function CaseStudyCards({ payload = {}, loading = false }) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  return (
    <SectionCard
      title="Кейсы"
      subtitle={`Сессии с самой глубокой историей (мин. версий: ${payload.min_versions ?? 10})`}
      eyebrow="Case studies"
    >
      {loading ? <div className="text-xs text-slate-500">Загрузка…</div> : null}
      {!loading && items.length === 0 ? (
        <div className="text-xs text-slate-500">Нет сессий с достаточной историей версий.</div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-3" data-testid="analytics-case-cards">
        {items.map((item) => {
          const timeline = Array.isArray(item.timeline) ? item.timeline : [];
          return (
            <article key={item.id} className="rounded-lg border border-slate-200 p-3" data-testid={`analytics-case-${item.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950" title={item.title}>{item.title || item.id}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {item.author_email || "—"} · {formatDurationSeconds(item.duration_seconds)}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                  {`${item.version_count} версий`}
                </span>
              </div>
              <ol className="mt-2 space-y-1">
                {timeline.map((point, idx) => (
                  <li key={`${item.id}_v${point.version}`} className="text-[11px] text-slate-600" data-testid={`analytics-case-${item.id}-point-${point.version}`}>
                    <span className="font-medium text-slate-800">{`v${point.version}`}</span>
                    {` · ${formatDateRu(point.created_at)} · `}
                    {`З:${point.tasks} Ш:${point.gateways} С:${point.events} П:${point.flows} В:${point.subprocesses} Св:${point.properties}`}
                    <span className="text-slate-400">{` · ${timelinePointLabel(idx, timeline.length)}`}</span>
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
