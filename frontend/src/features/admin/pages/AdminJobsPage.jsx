import { useMemo } from "react";
import AdminPageContainer from "../layout/AdminPageContainer";
import JobsSummaryRow from "../components/jobs/JobsSummaryRow";
import JobsTable from "../components/jobs/JobsTable";
import AutoPassOutcomesWidget from "../components/dashboard/AutoPassOutcomesWidget";
import JobsThroughputWidget from "../components/dashboard/JobsThroughputWidget";
import useAdminDashboardSnapshot from "../hooks/useAdminDashboardSnapshot";

export default function AdminJobsPage({
  payload = {},
  onNavigate,
}) {
  const dashboard = useAdminDashboardSnapshot();
  const throughputPayload = useMemo(() => {
    const dash = dashboard.data || {};
    return {
      ...(dash?.jobs_health || {}),
      avg_duration_s: dash?.jobs_health?.avg_duration_s,
      mode: dash?.redis_health?.mode,
    };
  }, [dashboard.data]);

  return (
    <AdminPageContainer
      summary={<JobsSummaryRow summary={payload?.summary || {}} />}
      secondary={dashboard.data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <AutoPassOutcomesWidget payload={dashboard.data?.charts?.autopass_outcomes || {}} onNavigate={onNavigate} />
          <JobsThroughputWidget payload={throughputPayload} />
        </div>
      ) : null}
    >
      <JobsTable items={payload?.items || []} />
    </AdminPageContainer>
  );
}
