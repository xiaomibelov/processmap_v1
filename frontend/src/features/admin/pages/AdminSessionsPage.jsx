import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
import AdminDateRangeFilter from "../components/filters/AdminDateRangeFilter";
import AdminFiltersBar from "../components/filters/AdminFiltersBar";
import AdminSearchInput from "../components/filters/AdminSearchInput";
import AdminSelectFilter from "../components/filters/AdminSelectFilter";
import AdminToggleFilter from "../components/filters/AdminToggleFilter";
import SessionsSummaryRow from "../components/sessions/SessionsSummaryRow";
import SessionsTable from "../components/sessions/SessionsTable";
import { asArray, formatTs, toInt, toText } from "../utils/adminFormat";
import { updateFilterState } from "../utils/adminQuery";
import { ru } from "../../../shared/i18n/ru";

export default function AdminSessionsPage({
  payload = {},
  filters = {},
  onFiltersChange,
  onOpenSession,
}) {
  const rows = asArray(payload?.items);
  const nowSec = Math.round(Date.now() / 1000);
  const minUpdatedAt = (
    toText(filters?.updatedRange) === "24h" ? nowSec - 24 * 60 * 60
      : toText(filters?.updatedRange) === "7d" ? nowSec - 7 * 24 * 60 * 60
        : toText(filters?.updatedRange) === "30d" ? nowSec - 30 * 24 * 60 * 60
          : 0
  );
  const visibleRows = rows.filter((row) => {
    if (filters?.attentionOnly && (toInt(row?.warnings_count, 0) + toInt(row?.errors_count, 0) <= 0)) return false;
    if (minUpdatedAt > 0 && toInt(row?.updated_at, 0) < minUpdatedAt) return false;
    return true;
  });
  const risky = visibleRows
    .filter((row) => toInt(row?.warnings_count, 0) > 0 || toInt(row?.errors_count, 0) > 0)
    .sort((a, b) => (toInt(b?.warnings_count, 0) + toInt(b?.errors_count, 0)) - (toInt(a?.warnings_count, 0) + toInt(a?.errors_count, 0)))
    .slice(0, 6);
  const filterItems = [
    { label: ru.admin.filters.query, value: filters?.q },
    { label: ru.admin.filters.status, value: filters?.status },
    { label: ru.admin.filters.owners, value: filters?.ownerIds },
    { label: ru.admin.filters.attention, value: filters?.attentionOnly ? ru.common.yes : "" },
    { label: ru.admin.filters.range, value: filters?.updatedRange },
  ];
  function setPatch(patch) {
    onFiltersChange?.(updateFilterState(filters, patch));
  }
  return (
    <AdminPageContainer
      summary={<SessionsSummaryRow items={visibleRows} />}
      secondary={(
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title={ru.admin.sessionsPage.attentionTitle} subtitle={ru.admin.sessionsPage.attentionSubtitle} eyebrow={ru.admin.sessionsPage.attentionEyebrow}>
            <div className="space-y-3">
              {risky.length ? risky.map((row) => (
                <button
                  key={toText(row?.session_id)}
                  type="button"
                  className="flex w-full items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left"
                  onClick={() => onOpenSession?.(toText(row?.session_id))}
                >
                  <div>
                    <div className="text-sm font-medium text-slate-950">{toText(row?.session_id)}</div>
                    <div className="mt-1 text-xs text-slate-500">{toText(row?.project_name || row?.project_id || "—")} · {formatTs(row?.updated_at)}</div>
                  </div>
                  <div className="text-xs text-amber-700">{toInt(row?.warnings_count, 0)}w / {toInt(row?.errors_count, 0)}e</div>
                </button>
              )) : <div className="text-sm text-slate-500">{ru.admin.sessionsPage.attentionEmpty}</div>}
            </div>
          </SectionCard>
          <SectionCard title={ru.admin.sessionsPage.redisTitle} subtitle={ru.admin.sessionsPage.redisSubtitle} eyebrow={ru.admin.sessionsPage.redisEyebrow}>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">ON</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{visibleRows.filter((row) => toText(row?.redis_mode).toLowerCase() === "on").length}</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs text-amber-700">{ru.admin.sessionsPage.redisFallback}</div>
                <div className="mt-2 text-2xl font-semibold text-amber-900">{visibleRows.filter((row) => toText(row?.redis_mode).toLowerCase() === "fallback").length}</div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                <div className="text-xs text-rose-700">{ru.admin.sessionsPage.redisIncident}</div>
                <div className="mt-2 text-2xl font-semibold text-rose-900">{visibleRows.filter((row) => toText(row?.redis_mode).toLowerCase() === "error").length}</div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    >
      <AdminFiltersBar title={ru.admin.sessionsPage.filtersTitle} subtitle={ru.admin.sessionsPage.filtersSubtitle} activeFilters={filterItems}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <AdminSearchInput value={toText(filters?.q)} onChange={(value) => setPatch({ q: value })} placeholder={ru.admin.sessionsPage.searchPlaceholder} testId="admin-sessions-q" />
          <AdminSelectFilter
            value={toText(filters?.status)}
            onChange={(value) => setPatch({ status: value })}
            testId="admin-sessions-status"
            options={[
              { value: "", label: ru.admin.filters.anyStatus },
              { value: "draft", label: ru.admin.statuses.draft },
              { value: "in_progress", label: ru.admin.statuses.inProgress },
              { value: "ready", label: ru.admin.statuses.ready },
            ]}
          />
          <AdminSearchInput value={toText(filters?.ownerIds)} onChange={(value) => setPatch({ ownerIds: value })} placeholder={ru.admin.sessionsPage.ownerIdsPlaceholder} />
          <AdminDateRangeFilter value={toText(filters?.updatedRange)} onChange={(value) => setPatch({ updatedRange: value })} />
          <AdminToggleFilter checked={Boolean(filters?.attentionOnly)} onChange={(value) => setPatch({ attentionOnly: value })} label={ru.admin.sessionsPage.attentionOnly} />
        </div>
      </AdminFiltersBar>
      <SessionsTable items={visibleRows} onOpenSession={onOpenSession} />
    </AdminPageContainer>
  );
}
