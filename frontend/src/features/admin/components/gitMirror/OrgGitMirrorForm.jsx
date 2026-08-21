import { useEffect, useMemo, useState } from "react";
import {
  apiGetOrgGitMirrorConfig,
  apiPatchOrgGitMirrorConfig,
  apiValidateOrgGitMirrorConfig,
} from "../../../../lib/api";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { formatTs, toText } from "../../utils/adminFormat";
import { useAdminMutation } from "../../hooks/useAdminMutation";
import { useAdminQuery } from "../../hooks/useAdminQuery";

function healthTone(statusRaw) {
  const status = String(statusRaw || "").toLowerCase();
  if (status === "valid") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "invalid") return "text-rose-700 bg-rose-50 border-rose-200";
  return "text-slate-600 bg-slate-50 border-slate-200";
}

function healthPillTone(statusRaw) {
  const status = String(statusRaw || "").toLowerCase();
  if (status === "valid") return "ok";
  if (status === "invalid") return "warn";
  return "default";
}

function ConfigLine({ label, value }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950">{String(value || "—")}</span>
    </div>
  );
}

async function fetchConfig(orgId) {
  const res = await apiGetOrgGitMirrorConfig(orgId);
  if (!res.ok) throw new Error(res.error || "Не удалось загрузить конфигурацию Git mirror.");
  return res.config || {};
}

export default function OrgGitMirrorForm({ orgId = "", canManage = false, onSaved }) {
  const oid = String(orgId || "").trim();

  const { data: cfg, isLoading, error: queryError } = useAdminQuery({
    queryKey: ["orgGitMirror", oid],
    fetcher: () => fetchConfig(oid),
    enabled: Boolean(oid),
  });

  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("");
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("");
  const [basePath, setBasePath] = useState("");

  useEffect(() => {
    setEnabled(cfg?.git_mirror_enabled === true);
    setProvider(String(cfg?.git_provider || ""));
    setRepository(String(cfg?.git_repository || ""));
    setBranch(String(cfg?.git_branch || ""));
    setBasePath(String(cfg?.git_base_path || ""));
  }, [cfg]);

  const payload = useMemo(() => ({
    git_mirror_enabled: enabled,
    git_provider: provider || null,
    git_repository: repository || null,
    git_branch: branch || null,
    git_base_path: basePath || null,
  }), [enabled, provider, repository, branch, basePath]);

  const patchMutation = useAdminMutation({
    mutationFn: async () => {
      const res = await apiPatchOrgGitMirrorConfig(oid, payload);
      if (!res.ok) throw new Error(res.error || "Не удалось сохранить конфигурацию Git mirror.");
      return res.config || {};
    },
    invalidateKeys: [["orgGitMirror", oid]],
    onSuccess: () => { onSaved?.(); },
  });

  const validateMutation = useAdminMutation({
    mutationFn: async () => {
      const res = await apiValidateOrgGitMirrorConfig(oid, payload);
      if (!res.ok) throw new Error(res.error || "Не удалось проверить конфигурацию Git mirror.");
      return res.config || {};
    },
    invalidateKeys: [["orgGitMirror", oid]],
  });

  const healthStatus = String(cfg?.git_health_status || "unknown");
  const healthMessage = toText(cfg?.git_health_message) || "Нет диагностического сообщения.";
  const updatedAt = Number(cfg?.git_updated_at || 0);
  const updatedBy = toText(cfg?.git_updated_by);

  if (!oid) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">Сначала выберите организацию.</div>;
  }

  return (
    <div className="space-y-3">
      {queryError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{queryError.message}</div> : null}
      {isLoading ? <div className="text-xs text-slate-500">Загрузка…</div> : null}

      <SectionCard eyebrow="Состояние" title="Состояние публикации" subtitle="Текущий статус и цель публикации.">
        <div className={`rounded-lg border px-3 py-2 text-xs ${healthTone(healthStatus)}`}>
          <div className="flex items-center gap-2">
            <span>Статус:</span>
            <StatusPill status={healthStatus} tone={healthPillTone(healthStatus)} compact />
          </div>
          <div className="mt-1">{healthMessage}</div>
        </div>
        <div className="mt-3 space-y-1.5">
          <ConfigLine label="Provider" value={provider || "—"} />
          <ConfigLine label="Repository" value={repository || "—"} />
          <ConfigLine label="Branch" value={branch || "—"} />
          <ConfigLine label="Base path" value={basePath || "—"} />
          {updatedAt > 0 ? <ConfigLine label="Обновлено" value={formatTs(updatedAt)} /> : null}
          {updatedBy ? <ConfigLine label="Кем" value={updatedBy} /> : null}
        </div>
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
          <span className="font-medium text-slate-800">Цель публикации:</span>{" "}
          {provider || repository || branch || basePath
            ? [provider, repository, branch ? `branch: ${branch}` : "", basePath ? `base: ${basePath}` : ""].filter(Boolean).join(" · ")
            : "Не настроена"}
        </div>
      </SectionCard>

      <SectionCard eyebrow="Настройки" title="Конфигурация" subtitle="Измените параметры публикации.">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); patchMutation.mutate(); }}>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              checked={enabled}
              disabled={!canManage || patchMutation.isPending || validateMutation.isPending}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Включить Git mirror
          </label>
          <div className="grid gap-2 md:grid-cols-2">
            <label>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Provider</div>
              <select className="input h-8 min-h-0 w-full py-1 text-xs" value={provider} disabled={!canManage || patchMutation.isPending || validateMutation.isPending} onChange={(e) => setProvider(e.target.value)}>
                <option value="">—</option>
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
            </label>
            <label>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Repository / Project</div>
              <input className="input h-8 min-h-0 w-full py-1 text-xs" type="text" placeholder="owner/repo или group/project" value={repository} disabled={!canManage || patchMutation.isPending || validateMutation.isPending} onChange={(e) => setRepository(e.target.value)} />
            </label>
            <label>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Branch</div>
              <input className="input h-8 min-h-0 w-full py-1 text-xs" type="text" placeholder="main" value={branch} disabled={!canManage || patchMutation.isPending || validateMutation.isPending} onChange={(e) => setBranch(e.target.value)} />
            </label>
            <label>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Base path</div>
              <input className="input h-8 min-h-0 w-full py-1 text-xs" type="text" placeholder="processmap/published" value={basePath} disabled={!canManage || patchMutation.isPending || validateMutation.isPending} onChange={(e) => setBasePath(e.target.value)} />
            </label>
          </div>
          {patchMutation.error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{patchMutation.error}</div> : null}
          {validateMutation.error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{validateMutation.error}</div> : null}
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="secondaryBtn h-7 min-h-0 rounded-lg px-3 py-0 text-xs" disabled={patchMutation.isPending || validateMutation.isPending}>
                {patchMutation.isPending ? "Сохранение…" : "Сохранить Git mirror"}
              </button>
              <button type="button" className="secondaryBtn h-7 min-h-0 rounded-lg px-3 py-0 text-xs" disabled={patchMutation.isPending || validateMutation.isPending} onClick={() => validateMutation.mutate()}>
                {validateMutation.isPending ? "Проверка…" : "Проверить конфигурацию"}
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Недостаточно прав для изменения настроек Git mirror.</div>
          )}
        </form>
      </SectionCard>
    </div>
  );
}
