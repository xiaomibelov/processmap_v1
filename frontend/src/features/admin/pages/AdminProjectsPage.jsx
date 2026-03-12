import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
import AdminFiltersBar from "../components/filters/AdminFiltersBar";
import ProjectsSummaryRow from "../components/projects/ProjectsSummaryRow";
import ProjectsTable from "../components/projects/ProjectsTable";
import { ru } from "../../../shared/i18n/ru";

export default function AdminProjectsPage({
  payload = {},
}) {
  return (
    <AdminPageContainer
      summary={<ProjectsSummaryRow items={payload?.items || []} />}
      secondary={(
        <SectionCard title={ru.admin.projectsPage.notesTitle} subtitle={ru.admin.projectsPage.notesSubtitle} eyebrow={ru.admin.projectsPage.notesEyebrow}>
          <div className="text-sm text-slate-500">
            {ru.admin.projectsPage.notesBody}
          </div>
        </SectionCard>
      )}
    >
      <AdminFiltersBar title={ru.admin.projectsPage.filtersTitle} subtitle={ru.admin.projectsPage.filtersSubtitle} />
      <ProjectsTable items={payload?.items || []} />
    </AdminPageContainer>
  );
}
