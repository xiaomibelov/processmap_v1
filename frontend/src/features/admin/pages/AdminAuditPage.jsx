import AdminPageContainer from "../layout/AdminPageContainer";
import AuditSummaryRow from "../components/audit/AuditSummaryRow";
import AuditTable from "../components/audit/AuditTable";
import AdminDateRangeFilter from "../components/filters/AdminDateRangeFilter";
import AdminFiltersBar from "../components/filters/AdminFiltersBar";
import AdminSearchInput from "../components/filters/AdminSearchInput";
import AdminSelectFilter from "../components/filters/AdminSelectFilter";
import { toText } from "../utils/adminFormat";
import { updateFilterState } from "../utils/adminQuery";

export default function AdminAuditPage({
  payload = {},
  filters = {},
  onFiltersChange,
}) {
  const rows = (payload?.items || []).filter((row) => {
    const range = toText(filters?.dateRange);
    if (!range) return true;
    const nowSec = Math.round(Date.now() / 1000);
    const ts = Number(row?.ts || 0);
    if (!Number.isFinite(ts) || ts <= 0) return true;
    if (range === "24h") return ts >= nowSec - 24 * 60 * 60;
    if (range === "7d") return ts >= nowSec - 7 * 24 * 60 * 60;
    if (range === "30d") return ts >= nowSec - 30 * 24 * 60 * 60;
    return true;
  });
  function setPatch(patch) {
    onFiltersChange?.(updateFilterState(filters, patch));
  }
  return (
    <AdminPageContainer
      summary={<AuditSummaryRow summary={payload?.summary || {}} />}
      secondary={null}
    >
      <AdminFiltersBar
        title="Audit Filters"
        subtitle="Filter by query, action, status, project, session, and time range"
        activeFilters={[
          { label: "Query", value: filters?.q },
          { label: "Status", value: filters?.status },
          { label: "Action", value: filters?.action },
          { label: "Project", value: filters?.projectId },
          { label: "Session", value: filters?.sessionId },
          { label: "Range", value: filters?.dateRange },
        ]}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <AdminSearchInput value={toText(filters?.q)} onChange={(value) => setPatch({ q: value })} placeholder="Search action / actor / entity" />
          <AdminSelectFilter
            value={toText(filters?.status)}
            onChange={(value) => setPatch({ status: value })}
            options={[
              { value: "", label: "Any status" },
              { value: "ok", label: "ok" },
              { value: "fail", label: "fail" },
            ]}
          />
          <AdminSearchInput value={toText(filters?.action)} onChange={(value) => setPatch({ action: value })} placeholder="Action" />
          <AdminSearchInput value={toText(filters?.projectId)} onChange={(value) => setPatch({ projectId: value })} placeholder="Project ID" />
          <AdminSearchInput value={toText(filters?.sessionId)} onChange={(value) => setPatch({ sessionId: value })} placeholder="Session ID" />
          <AdminDateRangeFilter value={toText(filters?.dateRange)} onChange={(value) => setPatch({ dateRange: value })} />
        </div>
      </AdminFiltersBar>
      <AuditTable items={rows} />
    </AdminPageContainer>
  );
}
