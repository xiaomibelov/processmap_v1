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
  onOpenRun,
}) {
  const items = asArray(payload?.items);
  if (loading) {
    return (
      <AdminPageContainer>
        <LoadingBlock label={ru.admin.runtime.loadingSection} />
      </AdminPageContainer>
    );
  }
  if (!items.length) {
    return (
      <AdminPageContainer>
        <EmptyState
          title={ru.admin.agentRunsPage.emptyState.title}
          description={ru.admin.agentRunsPage.emptyState.description}
        />
      </AdminPageContainer>
    );
  }

  const renderUser = (row) => {
    const name = toText(row?.user_name);
    const email = toText(row?.user_email);
    if (name && email) {
      return `${name} (${email})`;
    }
    return name || email || toText(row?.user_id) || "—";
  };

  const renderActions = (row) => {
    const applied = Number(row?.applied_count || 0);
    const rejected = Number(row?.rejected_count || 0);
    if (!applied && !rejected) {
      return "—";
    }
    const parts = [];
    if (applied) {
      parts.push(`${ru.admin.agentRunDetail.applied}: ${applied}`);
    }
    if (rejected) {
      parts.push(`${ru.admin.agentRunDetail.rejected}: ${rejected}`);
    }
    return parts.join(" / ");
  };

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
          <table className="w-full min-w-[840px] border-collapse text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-slate-400">
              <tr>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.conversationId}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.user}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.session}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.status}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.turns}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.tokens}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.firstActivity}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.lastActivity}</th>
                <th className="px-3 py-3">{ru.admin.agentRunsPage.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={toText(row?.conversation_id)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => onOpenRun?.(toText(row?.conversation_id))}
                >
                  <td className="px-3 py-3 font-medium text-slate-950">
                    {toText(row?.conversation_id)?.slice(0, 16) || "—"}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{renderUser(row)}</td>
                  <td className="px-3 py-3 text-slate-600">
                    {toText(row?.session_id)?.slice(0, 16) || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={row?.status} compact />
                  </td>
                  <td className="px-3 py-3 text-slate-600">{Number(row?.turn_count || 0)}</td>
                  <td className="px-3 py-3 text-slate-600">{Number(row?.total_tokens || 0)}</td>
                  <td className="px-3 py-3 text-slate-500">{formatTs(row?.first_activity_at)}</td>
                  <td className="px-3 py-3 text-slate-500">{formatTs(row?.last_activity_at)}</td>
                  <td className="px-3 py-3 text-slate-600">{renderActions(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AdminPageContainer>
  );
}
