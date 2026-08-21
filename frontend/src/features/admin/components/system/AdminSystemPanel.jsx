import { useState } from "react";
import AdminTabs from "../common/AdminTabs";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import FeatureFlagsWidget from "../dashboard/FeatureFlagsWidget";
import DeploymentNoticesTab from "./DeploymentNoticesTab";
import { apiAdminGetDashboard } from "../../../../lib/api";
import { ru } from "../../../../shared/i18n/ru";
import { formatDurationSeconds, formatTs, toInt, toText } from "../../utils/adminFormat";
import { useAdminQuery } from "../../hooks/useAdminQuery";

const SYSTEM_TABS = [
  { id: "notes", label: "Notes" },
  { id: "logs", label: "Logs" },
  { id: "settings", label: "Settings" },
  { id: "deploy", label: "Deploy" },
  { id: "maintenance", label: "Maintenance" },
];

function NotesTab() {
  return (
    <SectionCard eyebrow={ru.admin.orgsPage.notesEyebrow} title={ru.admin.orgsPage.notesTitle} subtitle={ru.admin.orgsPage.notesSubtitle}>
      <div className="space-y-2 text-xs text-slate-600">
        <p>{ru.admin.orgsPage.notesBody}</p>
        <p>Redis и runtime health остаются в операционной сводке; на этой странице они не конкурируют с управлением пользователями и доступом.</p>
      </div>
    </SectionCard>
  );
}

function LogsTab({ payload }) {
  const audit = Array.isArray(payload?.recent_audit) ? payload.recent_audit : [];
  const failures = Array.isArray(payload?.recent_failures) ? payload.recent_failures : [];
  return (
    <div className="space-y-3">
      <SectionCard eyebrow="Trace" title="Recent Audit" subtitle="Latest admin and workspace events">
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">Action</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5 font-medium">Actor</th>
                <th className="px-2 py-1.5 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {audit.length === 0 ? (
                <tr><td className="px-2 py-4 text-slate-500" colSpan={4}>No recent audit events.</td></tr>
              ) : null}
              {audit.slice(0, 10).map((row, idx) => (
                <tr key={`${toText(row?.id)}_${idx}`} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.action || "action")}</td>
                  <td className="px-2 py-2"><StatusPill status={row?.status} compact /></td>
                  <td className="px-2 py-2 text-slate-600">{toText(row?.actor || "unknown")}</td>
                  <td className="px-2 py-2 text-slate-500">{formatTs(row?.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <SectionCard eyebrow="Errors" title="Recent Failures" subtitle="Latest failure events from runtime">
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">Kind</th>
                <th className="px-2 py-1.5 font-medium">Title</th>
                <th className="px-2 py-1.5 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {failures.length === 0 ? (
                <tr><td className="px-2 py-4 text-slate-500" colSpan={3}>No recent failures.</td></tr>
              ) : null}
              {failures.slice(0, 10).map((row, idx) => (
                <tr key={`${toText(row?.id)}_${idx}`} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-2 font-medium text-slate-950">{toText(row?.kind)}</td>
                  <td className="px-2 py-2 text-slate-600">{toText(row?.title)}</td>
                  <td className="px-2 py-2 text-slate-500">{toText(row?.message)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function SettingsTab() {
  return (
    <SectionCard eyebrow="Settings" title="Feature Flags" subtitle="Runtime toggles returned by /api/feature-flags">
      <FeatureFlagsWidget />
    </SectionCard>
  );
}

function KvItem({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function MaintenanceTab({ payload }) {
  const redis = payload?.redis_health || {};
  const jobs = payload?.jobs_health || {};
  const mode = toText(redis.mode || "UNKNOWN");
  return (
    <div className="space-y-3">
      <SectionCard eyebrow="Persistence" title="Redis Health" subtitle="Runtime persistence and queue status">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <KvItem label="Mode" value={mode} />
          <KvItem label="State" value={toText(redis.state || "unknown")} />
          <KvItem label="Queue Enabled" value={redis.queue_enabled ? "Yes" : "No"} />
          <KvItem label="Queue Depth" value={String(redis.queue_depth ?? 0)} />
          <KvItem label="Lock Busy Total" value={String(redis.lock_busy_total ?? 0)} />
          <KvItem label="Reason" value={toText(redis.reason || "—") || "—"} />
        </div>
      </SectionCard>
      <SectionCard eyebrow="Execution" title="Jobs Throughput" subtitle="Queue state, completions, and contention">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <KvItem label="Queue Depth" value={toInt(jobs.queue_depth, 0)} />
          <KvItem label="AutoPass Runs" value={toInt(jobs.autopass_runs, 0)} />
          <KvItem label="Completed" value={toInt(jobs.autopass_done, 0)} />
          <KvItem label="Failed" value={toInt(jobs.autopass_failed, 0)} />
          <KvItem label="Lock Busy" value={toInt(jobs.lock_busy_total, 0)} />
          <KvItem label="Avg Duration" value={formatDurationSeconds(jobs.avg_duration_s)} />
        </div>
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
          Queue mode: {toText(jobs.mode || "derived")}
        </div>
      </SectionCard>
    </div>
  );
}

const fetchDashboard = async () => {
  const res = await apiAdminGetDashboard({ limit: 50 });
  if (!res.ok) {
    throw new Error(res.error || "Не удалось загрузить системные данные.");
  }
  return res.data || {};
};

export default function AdminSystemPanel() {
  const [activeTab, setActiveTab] = useState("notes");
  const { data: payload, isLoading: loading, error: queryError } = useAdminQuery({
    queryKey: ["adminDashboard"],
    fetcher: fetchDashboard,
    enabled: true,
  });
  const error = queryError ? queryError.message : "";

  return (
    <div id="admin-access-system" className="space-y-3">
      <AdminTabs tabs={SYSTEM_TABS} activeTab={activeTab} onChange={setActiveTab} />
      {loading ? <div className="text-xs text-slate-500">Загрузка…</div> : null}
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
      {activeTab === "notes" ? <NotesTab /> : null}
      {activeTab === "logs" ? <LogsTab payload={payload} /> : null}
      {activeTab === "settings" ? <SettingsTab /> : null}
      {activeTab === "deploy" ? <DeploymentNoticesTab /> : null}
      {activeTab === "maintenance" ? <MaintenanceTab payload={payload} /> : null}
    </div>
  );
}
