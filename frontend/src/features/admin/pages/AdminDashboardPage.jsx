import AdminPageContainer from "../layout/AdminPageContainer";
import AutoPassOutcomesWidget from "../components/dashboard/AutoPassOutcomesWidget";
import DashboardKpiRow from "../components/dashboard/DashboardKpiRow";
import EndpointCheckWidget from "../components/dashboard/EndpointCheckWidget";
import JobsThroughputWidget from "../components/dashboard/JobsThroughputWidget";
import PublishGitMirrorWidget from "../components/dashboard/PublishGitMirrorWidget";
import FeatureFlagsWidget from "../components/dashboard/FeatureFlagsWidget";
import RecentAuditWidget from "../components/dashboard/RecentAuditWidget";
import RedisHealthWidget from "../components/dashboard/RedisHealthWidget";
import ReportsHealthWidget from "../components/dashboard/ReportsHealthWidget";
import RequiresAttentionWidget from "../components/dashboard/RequiresAttentionWidget";
import SessionsActivityWidget from "../components/dashboard/SessionsActivityWidget";

export default function AdminDashboardPage({
  payload = {},
  onNavigate,
  canOpenApiDocs = false,
}) {
  return (
    <AdminPageContainer
      summary={<DashboardKpiRow kpis={payload?.kpis || {}} />}
      secondary={(
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <RedisHealthWidget payload={payload?.redis_health || {}} />
          <RecentAuditWidget items={payload?.recent_audit || []} />
        </div>
      )}
    >
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <SessionsActivityWidget points={payload?.charts?.sessions_activity || []} />
        <AutoPassOutcomesWidget payload={payload?.charts?.autopass_outcomes || {}} onNavigate={onNavigate} />
        <JobsThroughputWidget payload={{ ...(payload?.jobs_health || {}), avg_duration_s: payload?.jobs_health?.avg_duration_s, mode: payload?.redis_health?.mode }} />
        <ReportsHealthWidget payload={payload?.charts?.report_doc_health || {}} />
        <RequiresAttentionWidget items={payload?.requires_attention || []} onNavigate={onNavigate} />
        <PublishGitMirrorWidget payload={payload?.publish_git_mirror || {}} />
        <FeatureFlagsWidget />
        {/* Гейт по праву «API Docs» (canOpenOrgSettings — роль в АКТИВНОЙ org).
            Осознанно строже backend (тот принимает роль в любой org):
            безопасное направление расхождения, оставлено по итогам review. */}
        {canOpenApiDocs ? <EndpointCheckWidget /> : null}
      </div>
    </AdminPageContainer>
  );
}
