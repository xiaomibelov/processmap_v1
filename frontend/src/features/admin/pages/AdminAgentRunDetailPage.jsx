import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import { asArray, formatTs, toText } from "../utils/adminFormat";
import { ru } from "../../../shared/i18n/ru";

function TimelineItem({ turn }) {
  const isUser = toText(turn?.role) === "user";
  const text = toText(turn?.text);
  const truncated = turn?.truncated && text.length > 500 ? `${text.slice(0, 500)}…` : text;
  return (
    <div className={`flex gap-3 py-3 ${isUser ? "" : "bg-slate-50/60"}`}>
      <div className="w-20 shrink-0 pt-0.5 text-right text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {isUser ? "User" : "Assistant"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-800">
          {truncated || <span className="italic text-slate-400">—</span>}
        </div>
        {turn?.action && (
          <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">
            action: {toText(turn.action)}
          </div>
        )}
        <div className="mt-1 text-[11px] text-slate-400">{formatTs(turn?.created_at)}</div>
      </div>
    </div>
  );
}

export default function AdminAgentRunDetailPage({
  payload = {},
  loading = false,
  error = "",
  onBack,
}) {
  const item = payload?.item || {};
  const conversationId = toText(item?.conversation_id);
  const turns = asArray(item?.turns);
  const actions = item?.actions || {};
  const status = toText(item?.status);
  const summary = item?.summary;
  const summaryMissing = Boolean(item?.summary_missing);

  const userName = toText(item?.user_name);
  const userEmail = toText(item?.user_email);
  const userLabel = (() => {
    if (userName && userEmail) return `${userName} (${userEmail})`;
    return userName || userEmail || toText(item?.user_id) || "—";
  })();

  const sessionLink = (() => {
    const projectId = toText(item?.project_id);
    const sessionId = toText(item?.session_id);
    if (!projectId || !sessionId) return null;
    return `/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(sessionId)}`;
  })();

  if (loading) {
    return (
      <AdminPageContainer>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
          {ru.admin.agentRunDetail.loading}
        </div>
      </AdminPageContainer>
    );
  }

  if (toText(error)) {
    return (
      <AdminPageContainer>
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-4 text-sm text-rose-700">
          {toText(error)}
        </div>
      </AdminPageContainer>
    );
  }

  if (!conversationId) {
    return (
      <AdminPageContainer>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
          {ru.admin.agentRunDetail.notFound}
        </div>
      </AdminPageContainer>
    );
  }

  return (
    <AdminPageContainer>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="secondaryBtn h-7 min-h-0 rounded-lg px-2.5 py-0 text-xs"
        >
          {ru.admin.agentRunDetail.back}
        </button>
        <h1 className="text-base font-semibold text-slate-950">
          {ru.admin.agentRunDetail.title}
        </h1>
      </div>

      <SectionCard>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunsPage.table.conversationId}
            </div>
            <div className="mt-0.5 text-sm font-medium text-slate-950">{conversationId}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunDetail.user}
            </div>
            <div className="mt-0.5 text-sm text-slate-700">{userLabel}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunDetail.session}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-700">
              <span>{toText(item?.session_id) || "—"}</span>
              {sessionLink && (
                <a
                  href={sessionLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-violet-700 hover:underline"
                >
                  {ru.admin.agentRunDetail.openSession}
                </a>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunsPage.table.status}
            </div>
            <div className="mt-0.5">
              <StatusPill status={status} compact />
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunsPage.table.turns}
            </div>
            <div className="text-sm font-medium text-slate-900">{Number(item?.turn_count || 0)}</div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunsPage.table.tokens}
            </div>
            <div className="text-sm font-medium text-slate-900">{Number(item?.total_tokens || 0)}</div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunDetail.applied}
            </div>
            <div className="text-sm font-medium text-slate-900">{Number(actions?.applied || 0)}</div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunDetail.rejected}
            </div>
            <div className="text-sm font-medium text-slate-900">{Number(actions?.rejected || 0)}</div>
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {ru.admin.agentRunDetail.summary}
          </div>
          {summary ? (
            <div className="rounded-lg border border-slate-100 bg-white p-3 text-sm leading-relaxed text-slate-700">
              {summary}
            </div>
          ) : summaryMissing ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm italic text-slate-500">
              {ru.admin.agentRunDetail.summaryMissing}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm italic text-slate-500">
              {status === "active" ? "Саммари формируется после закрытия диалога" : ru.admin.agentRunDetail.summaryMissing}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard className="mt-3">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          {ru.admin.agentRunDetail.timeline}
        </div>
        <div className="divide-y divide-slate-100">
          {turns.length > 0 ? (
            turns.map((turn) => <TimelineItem key={toText(turn?.id)} turn={turn} />)
          ) : (
            <div className="py-4 text-sm italic text-slate-400">Реплик нет.</div>
          )}
        </div>
      </SectionCard>
    </AdminPageContainer>
  );
}
