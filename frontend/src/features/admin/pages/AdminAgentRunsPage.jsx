import AdminPageContainer from "../layout/AdminPageContainer";
import AdminPageHeader from "../layout/AdminPageHeader";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import EmptyState from "../components/common/EmptyState";
import LoadingBlock from "../components/common/LoadingBlock";
import { asArray, formatTs, toText } from "../utils/adminFormat";
import { ru } from "../../../shared/i18n/ru";

export default function AdminAgentRunsPage({
  payload = {},
  loading = false,
}) {
  const runs = asArray(payload?.runs);
  if (loading) {
    return (
      <AdminPageContainer>
        <LoadingBlock label={ru.admin.runtime.loadingSection} />
      </AdminPageContainer>
    );
  }
  if (!runs.length) {
    return (
      <AdminPageContainer>
        <EmptyState
          title={ru.admin.agentRunsPage.emptyState.title}
          description={ru.admin.agentRunsPage.emptyState.description}
        />
      </AdminPageContainer>
    );
  }
  return (
    <AdminPageContainer>
      <AdminPageHeader
        title={ru.admin.route.agentRuns.title}
        subtitle={ru.admin.route.agentRuns.subtitle}
      />
      <SectionCard
        title={ru.admin.agentRunsPage.table.title}
        subtitle={ru.admin.agentRunsPage.table.subtitle}
        eyebrow={ru.admin.common.listEyebrow}
      >
        <div className="overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.runId}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.contour}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.status}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.agents}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.started}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.lastActivity}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.stopRequested}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((row) => (
                <tr key={toText(row?.run_id)} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-medium text-slate-950">{toText(row?.run_id)}</td>
                  <td className="px-3 py-3 text-slate-600">{toText(row?.contour_id || "—")}</td>
                  <td className="px-3 py-3"><StatusPill status={row?.status} /></td>
                  <td className="px-3 py-3 text-slate-600">
                    {asArray(row?.agents).map((a) => toText(a?.agent)).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-3 text-slate-500">{formatTs(row?.started_at)}</td>
                  <td className="px-3 py-3 text-slate-500">{formatTs(row?.last_activity_at)}</td>
                  <td className="px-3 py-3 text-slate-500">
                    {row?.stop_requested ? ru.common.yes : ru.common.no}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AdminPageContainer>
  );
}
