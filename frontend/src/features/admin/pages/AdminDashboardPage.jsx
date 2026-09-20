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
    <AdminPageContainer
      secondary={(
        <div className="grid gap-3 lg:grid-cols-2">
          <CapabilityMapSection groups={payload?.capability_map || []} onNavigate={onNavigate} />
          <div className="space-y-3">
            <AttentionSection items={payload?.attention || []} onNavigate={onNavigate} />
            <SystemFactsStrip payload={payload} />
          </div>
        </div>
      )}
    >
      <FeatureFlagsCatalogSection />
      <RecentAuditWidget items={asArray(payload?.recent_audit).slice(0, 5)} />
    </AdminPageContainer>
  );
}
