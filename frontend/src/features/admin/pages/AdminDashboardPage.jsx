import AdminPageContainer from "../layout/AdminPageContainer";
import AttentionSection from "../components/dashboard/AttentionSection";
import CapabilityMapSection from "../components/dashboard/CapabilityMapSection";
import FeatureFlagsCatalogSection from "../components/dashboard/FeatureFlagsCatalogSection";
import RecentAuditWidget from "../components/dashboard/RecentAuditWidget";
import SystemFactsStrip from "../components/dashboard/SystemFactsStrip";
import { asArray } from "../utils/adminFormat";

export default function AdminDashboardPage({
  payload = {},
  onNavigate,
  canOpenApiDocs = false,
}) {
  void canOpenApiDocs;
  return (
    <AdminPageContainer>
      <div className="space-y-3" data-testid="dashboard-v2">
        <AttentionSection items={payload?.attention || []} onNavigate={onNavigate} />
        <SystemFactsStrip payload={payload} />
        <div className="grid items-start gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CapabilityMapSection groups={payload?.capability_map || []} onNavigate={onNavigate} />
          </div>
          <FeatureFlagsCatalogSection />
        </div>
        <RecentAuditWidget items={asArray(payload?.recent_audit).slice(0, 5)} />
      </div>
    </AdminPageContainer>
  );
}
