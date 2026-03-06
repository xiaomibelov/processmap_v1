import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
import JobsSummaryRow from "../components/jobs/JobsSummaryRow";
import JobsTable from "../components/jobs/JobsTable";
import QueueHealthWidget from "../components/jobs/QueueHealthWidget";
import { asArray, toText } from "../utils/adminFormat";

export default function AdminJobsPage({
  payload = {},
}) {
  const failedRows = asArray(payload?.items).filter((row) => ["failed", "error"].includes(toText(row?.status).toLowerCase())).slice(0, 6);
  return (
    <AdminPageContainer
      summary={<JobsSummaryRow summary={payload?.summary || {}} />}
      secondary={(
        <div className="grid gap-4 xl:grid-cols-2">
          <QueueHealthWidget payload={payload?.queue_health || {}} />
          <SectionCard title="Recent Failures" subtitle="Quick access to last failed jobs" eyebrow="Attention">
            <div className="space-y-2">
              {failedRows.length ? failedRows.map((row) => (
                <div key={toText(row?.job_id)} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
                  <div className="text-sm font-medium text-slate-950">{toText(row?.job_id)}</div>
                  <div className="mt-1 text-xs text-slate-500">{toText(row?.session_id || "—")} · {toText(row?.last_error || "failed")}</div>
                </div>
              )) : <div className="text-sm text-slate-500">No failed jobs in current payload.</div>}
            </div>
          </SectionCard>
        </div>
      )}
    >
      <JobsTable items={payload?.items || []} />
    </AdminPageContainer>
  );
}

