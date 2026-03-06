import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
import AdminFiltersBar from "../components/filters/AdminFiltersBar";
import ProjectsSummaryRow from "../components/projects/ProjectsSummaryRow";
import ProjectsTable from "../components/projects/ProjectsTable";

export default function AdminProjectsPage({
  payload = {},
}) {
  return (
    <AdminPageContainer
      summary={<ProjectsSummaryRow items={payload?.items || []} />}
      secondary={(
        <SectionCard title="Project Health Notes" subtitle="Per-project template/report metrics depend on richer server aggregation." eyebrow="Notes">
          <div className="text-sm text-slate-500">
            V1 keeps project inventory operational and dashboard-first, while project-level template/report attribution remains explicitly marked as pending backend enrichment.
          </div>
        </SectionCard>
      )}
    >
      <AdminFiltersBar title="Projects Filters" subtitle="Current backend exposes query-based filtering; additional drill-down filters can be layered next." />
      <ProjectsTable items={payload?.items || []} />
    </AdminPageContainer>
  );
}

