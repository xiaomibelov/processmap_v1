import { useState } from "react";
import AdminTabs from "../common/AdminTabs";
import RedisHealthWidget from "../dashboard/RedisHealthWidget";
import JobsThroughputWidget from "../dashboard/JobsThroughputWidget";
import RecentAuditWidget from "../dashboard/RecentAuditWidget";
import FeatureFlagsWidget from "../dashboard/FeatureFlagsWidget";
import { apiAdminGetDashboard } from "../../../../lib/api";
import { ru } from "../../../../shared/i18n/ru";
import { useAdminQuery } from "../../hooks/useAdminQuery";

const SYSTEM_TABS = [
  { id: "notes", label: "Заметки" },
  { id: "runtime", label: "Runtime" },
  { id: "audit", label: "Аудит" },
  { id: "flags", label: "Feature flags" },
];

function NotesTab() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
      <div className="font-semibold text-slate-800">{ru.admin.orgsPage.notesTitle || "Системное состояние и служебные заметки"}</div>
      <div className="mt-2 space-y-2 text-xs text-slate-500">
        <p>{ru.admin.orgsPage.notesBody}</p>
        <p>Redis и runtime health остаются в операционной сводке; на этой странице они не конкурируют с управлением пользователями и доступом.</p>
      </div>
    </div>
  );
}

function RuntimeTab({ payload }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <RedisHealthWidget payload={payload?.redis_health || {}} />
      <JobsThroughputWidget payload={{ ...(payload?.jobs_health || {}), mode: payload?.redis_health?.mode }} />
    </div>
  );
}

function AuditTab({ items }) {
  return <RecentAuditWidget items={items || []} />;
}

function FlagsTab() {
  return <FeatureFlagsWidget />;
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
      {loading ? <div className="text-sm text-slate-500">Загрузка…</div> : null}
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {activeTab === "notes" ? <NotesTab /> : null}
      {activeTab === "runtime" ? <RuntimeTab payload={payload} /> : null}
      {activeTab === "audit" ? <AuditTab items={payload?.recent_audit || []} /> : null}
      {activeTab === "flags" ? <FlagsTab /> : null}
    </div>
  );
}
