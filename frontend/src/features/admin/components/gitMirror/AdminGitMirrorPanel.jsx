import { useState } from "react";
import { apiGetOrgGitMirrorConfig } from "../../../../lib/api";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { formatTs, toText } from "../../utils/adminFormat";
import { useAdminQuery } from "../../hooks/useAdminQuery";
import OrgGitMirrorForm from "./OrgGitMirrorForm";

function healthPillTone(statusRaw) {
  const status = String(statusRaw || "").toLowerCase();
  if (status === "valid") return "ok";
  if (status === "invalid") return "warn";
  return "default";
}

async function fetchConfig(orgId) {
  const res = await apiGetOrgGitMirrorConfig(orgId);
  if (!res.ok) throw new Error(res.error || "Не удалось загрузить конфигурацию Git mirror.");
  return res.config || {};
}

export default function AdminGitMirrorPanel({ activeOrgId = "", activeOrgRole = "", isAdmin = false, onSaved }) {
  const oid = String(activeOrgId || "").trim();
  const canManage = isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());
  const [expanded, setExpanded] = useState(false);

  const { data: cfg, isLoading, error: queryError } = useAdminQuery({
    queryKey: ["orgGitMirror", oid],
    fetcher: () => fetchConfig(oid),
    enabled: Boolean(oid),
  });

  const healthStatus = String(cfg?.git_health_status || "unknown");
  const provider = toText(cfg?.git_provider) || "—";
  const repository = toText(cfg?.git_repository) || "—";
  const branch = toText(cfg?.git_branch) || "—";
  const updatedAt = Number(cfg?.git_updated_at || 0);

  return (
    <SectionCard eyebrow="Техническая публикация" title="Git mirror" subtitle="Статус и настройки publish-only mirror для активной организации.">
      {!oid ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">Сначала выберите активную организацию.</div>
      ) : (
        <div className="space-y-3">
          {queryError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{queryError.message}</div> : null}
          {isLoading ? <div className="text-xs text-slate-500">Загрузка…</div> : null}
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="px-2 py-1.5 font-medium"></th>
                  <th className="px-2 py-1.5 font-medium">Provider</th>
                  <th className="px-2 py-1.5 font-medium">Repository</th>
                  <th className="px-2 py-1.5 font-medium">Branch</th>
                  <th className="px-2 py-1.5 font-medium">Статус</th>
                  <th className="px-2 py-1.5 font-medium">Обновлено</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="secondaryBtn h-6 min-h-0 rounded-lg px-1.5 py-0 text-[10px]"
                      onClick={() => setExpanded((v) => !v)}
                      aria-expanded={expanded}
                    >
                      {expanded ? "−" : "+"}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-slate-950">{provider}</td>
                  <td className="px-2 py-2 text-slate-600">{repository}</td>
                  <td className="px-2 py-2 text-slate-600">{branch}</td>
                  <td className="px-2 py-2"><StatusPill status={healthStatus} tone={healthPillTone(healthStatus)} compact /></td>
                  <td className="px-2 py-2 text-slate-500">{updatedAt > 0 ? formatTs(updatedAt) : "—"}</td>
                </tr>
                {expanded ? (
                  <tr className="border-t border-slate-100 bg-slate-50/70">
                    <td colSpan={6} className="px-2 py-2">
                      <OrgGitMirrorForm orgId={oid} canManage={canManage} onSaved={onSaved} />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
