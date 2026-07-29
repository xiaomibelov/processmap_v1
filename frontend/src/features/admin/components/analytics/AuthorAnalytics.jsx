import SectionCard from "../common/SectionCard";
import { formatDurationSeconds } from "./analyticsFormat";

// Author aggregates from the summary payload (author_stats is computed
// server-side; the hide-test-accounts toggle re-fetches with
// exclude_test=true, also filtered server-side).
export default function AuthorAnalytics({
  authorStats = [],
  excludeTest = false,
  onExcludeTestChange,
}) {
  const rows = Array.isArray(authorStats) ? authorStats : [];
  return (
    <SectionCard
      title="Аналитика по авторам"
      subtitle="Сессии и глубина истории в разрезе авторов"
      eyebrow="Authors"
      action={(
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={!!excludeTest}
            onChange={(event) => onExcludeTestChange?.(event.target.checked)}
            data-testid="analytics-exclude-test"
          />
          Скрыть тестовые аккаунты
        </label>
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs" data-testid="analytics-authors-table">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.12em] text-slate-400">
              <th className="px-2 py-1.5 font-medium">Автор</th>
              <th className="px-2 py-1.5 font-medium">Сессий</th>
              <th className="px-2 py-1.5 font-medium">Ср. версий</th>
              <th className="px-2 py-1.5 font-medium">Ср. время жизни</th>
              <th className="px-2 py-1.5 font-medium">Заброшено</th>
              <th className="px-2 py-1.5 font-medium">Активных</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-2 py-4 text-center text-slate-500">Нет данных</td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.author_email} className="border-b border-slate-100 text-slate-700" data-testid={`analytics-author-row-${row.author_email}`}>
                <td className="max-w-[240px] truncate px-2 py-1.5" title={row.author_email}>
                  {row.author_email}
                  {row.is_test_account ? (
                    <span className="ml-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-500">test</span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5">{row.sessions}</td>
                <td className="px-2 py-1.5">{row.avg_versions}</td>
                <td className="px-2 py-1.5">{formatDurationSeconds(row.avg_lifetime_seconds)}</td>
                <td className="px-2 py-1.5">{row.abandoned}</td>
                <td className="px-2 py-1.5">{row.real}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
