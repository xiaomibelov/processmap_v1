import { useMemo, useState } from "react";

import AdminTabs from "../components/common/AdminTabs";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import AdminPageContainer from "../layout/AdminPageContainer";
import { asArray, asObject, toText } from "../utils/adminFormat";
import { ru } from "../../../shared/i18n/ru";

const AGENT_TABS = [
  { id: "0", label: "План / Analytics" },
  { id: "1", label: "Агент 1 — Planner" },
  { id: "2", label: "Агент 2 — Worker" },
  { id: "3", label: "Агент 3 — Reviewer" },
];

function TerminalPanel({ log = "", agent = "" }) {
  const displayLog = toText(log) || ru.admin.agentRunDetail.emptyLog;
  return (
    <div className="mt-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {ru.admin.agentRunDetail.terminalTitle} {agent}
        </span>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3">
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-200">
          {displayLog}
        </pre>
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
  const [activeTab, setActiveTab] = useState("0");
  const runId = toText(payload?.run_id);
  const contourId = toText(payload?.contour_id);
  const status = toText(payload?.status);
  const agents = asArray(payload?.agents);
  const markers = asObject(payload?.markers);

  const activeAgent = useMemo(() => {
    return agents.find((a) => toText(a?.agent) === activeTab) || null;
  }, [agents, activeTab]);

  const markerList = useMemo(() => {
    return Object.entries(markers).map(([name, info]) => ({
      name,
      exists: Boolean(info?.exists),
      mtime: info?.mtime || 0,
    }));
  }, [markers]);

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

  if (!runId) {
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
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunsPage.table.runId}
            </div>
            <div className="mt-0.5 text-sm font-medium text-slate-950">{runId}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunsPage.table.contour}
            </div>
            <div className="mt-0.5 text-sm font-medium text-slate-950">{contourId || "—"}</div>
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

        {markerList.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {ru.admin.agentRunDetail.markers}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {markerList.map((m) => (
                <span
                  key={m.name}
                  className={`inline-flex items-center rounded-lg border px-1.5 py-0.5 text-[10px] font-medium ${
                    m.exists
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-100 text-slate-400"
                  }`}
                >
                  {m.exists ? "✅" : "·"} {m.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <AdminTabs tabs={AGENT_TABS} activeTab={activeTab} onChange={setActiveTab} />
        <TerminalPanel log={activeAgent?.log || ""} agent={activeTab} />
      </SectionCard>
    </AdminPageContainer>
  );
}
