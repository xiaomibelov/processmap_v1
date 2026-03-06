import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
import AdminFiltersBar from "../components/filters/AdminFiltersBar";
import OrgsSummaryRow from "../components/orgs/OrgsSummaryRow";
import OrgsTable from "../components/orgs/OrgsTable";

export default function AdminOrgsPage({
  payload = {},
}) {
  return (
    <AdminPageContainer
      summary={<OrgsSummaryRow items={payload?.items || []} activeOrgId={payload?.active_org_id} />}
      secondary={(
        <SectionCard title="Org Health Notes" subtitle="This V1 wireframe is membership-backed; deeper org metrics can be added when backend exposes them." eyebrow="Notes">
          <div className="text-sm text-slate-500">
            Current `/api/admin/orgs` payload provides org memberships, actor, and active org context. Members/projects/invites health cells are intentionally shown as scoped placeholders rather than synthetic values.
          </div>
        </SectionCard>
      )}
    >
      <AdminFiltersBar title="Organizations Filters" subtitle="V1 org page is scope-aware and currently filter-light." />
      <OrgsTable items={payload?.items || []} />
    </AdminPageContainer>
  );
}

