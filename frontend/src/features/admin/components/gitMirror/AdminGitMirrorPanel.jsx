import { useEffect, useState } from "react";
import {
  apiGetOrgGitMirrorConfig,
  apiPatchOrgGitMirrorConfig,
  apiValidateOrgGitMirrorConfig,
} from "../../../../lib/api";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";

function healthTone(statusRaw) {
  const status = String(statusRaw || "").toLowerCase();
  if (status === "valid") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "invalid") return "text-rose-700 bg-rose-50 border-rose-200";
  return "text-slate-600 bg-slate-50 border-slate-200";
}

function ConfigLine({ label, value }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950">{String(value || "—")}</span>
    </div>
  );
}

export default function AdminGitMirrorPanel({ activeOrgId = "", activeOrgRole = "", isAdmin = false, onSaved }) {
  const oid = String(activeOrgId || "").trim();
  const canManage = isAdmin || ["org_owner", "org_admin"].includes(String(activeOrgRole || "").toLowerCase());

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("");
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("");
  const [basePath, setBasePath] = useState("");
  const [healthStatus, setHealthStatus] = useState("unknown");
  const [healthMessage, setHealthMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState(0);
  const [updatedBy, setUpdatedBy] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      if (!oid) return;
      setLoading(true);
      setError("");
      const res = await apiGetOrgGitMirrorConfig(oid);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(String(res.error || "Не удалось загрузить конфигурацию Git mirror."));
        return;
      }
      applyConfig(res.config || {});
    }
    void loadConfig();
    return () => { cancelled = true; };
  }, [oid]);

  function applyConfig(cfg) {
    setEnabled(cfg.git_mirror_enabled === true);
    setProvider(String(cfg.git_provider || ""));
    setRepository(String(cfg.git_repository || ""));
    setBranch(String(cfg.git_branch || ""));
    setBasePath(String(cfg.git_base_path || ""));
    setHealthStatus(String(cfg.git_health_status || "unknown"));
    setHealthMessage(String(cfg.git_health_message || ""));
    setUpdatedAt(Number(cfg.git_updated_at || 0));
    setUpdatedBy(String(cfg.git_updated_by || ""));
  }

  function currentPayload() {
    return {
      git_mirror_enabled: enabled,
      git_provider: provider || null,
      git_repository: repository || null,
      git_branch: branch || null,
      git_base_path: basePath || null,
    };
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!oid || !canManage) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const res = await apiPatchOrgGitMirrorConfig(oid, currentPayload());
    setBusy(false);
    if (!res.ok) {
      setError(String(res.error || "Не удалось сохранить конфигурацию Git mirror."));
      return;
    }
    applyConfig(res.config || {});
    setSuccess("Конфигурация Git mirror сохранена.");
    onSaved?.();
  }

  async function handleValidate() {
    if (!oid || !canManage) return;
    setValidating(true);
    setError("");
    setSuccess("");
    const res = await apiValidateOrgGitMirrorConfig(oid, currentPayload());
    setValidating(false);
    if (!res.ok) {
      setError(String(res.error || "Не удалось проверить конфигурацию Git mirror."));
      return;
    }
    applyConfig(res.config || {});
    setSuccess("Конфигурация проверена.");
  }

  const targetParts = [
    provider ? provider : "provider: —",
    repository ? repository : "repo/project: —",
    branch ? `branch: ${branch}` : "branch: —",
    basePath ? `base path: ${basePath}` : "base path: —",
  ];

  return (
    <div id="admin-access-git" className="grid gap-3 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <SectionCard
          eyebrow="Техническая публикация"
          title="Git mirror / публикация"
          subtitle="Настройки publish-only mirror для активной организации."
        >
          {!oid ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              Сначала выберите активную организацию.
            </div>
          ) : (
            <form className="space-y-3" onSubmit={handleSave}>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  checked={enabled}
                  disabled={!canManage || busy || loading || validating}
                  onChange={(event) => setEnabled(event.target.checked)}
                />
                Включить Git mirror
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</div>
                  <select
                    className="input h-9 min-h-0 w-full py-1.5 text-sm"
                    value={provider}
                    disabled={!canManage || busy || loading || validating}
                    onChange={(event) => setProvider(event.target.value)}
                  >
                    <option value="">—</option>
                    <option value="github">GitHub</option>
                    <option value="gitlab">GitLab</option>
                  </select>
                </label>
                <label>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Repository / Project</div>
                  <input
                    className="input h-9 min-h-0 w-full py-1.5 text-sm"
                    type="text"
                    placeholder="owner/repo или group/subgroup/project"
                    value={repository}
                    disabled={!canManage || busy || loading || validating}
                    onChange={(event) => setRepository(event.target.value)}
                  />
                </label>
                <label>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</div>
                  <input
                    className="input h-9 min-h-0 w-full py-1.5 text-sm"
                    type="text"
                    placeholder="main"
                    value={branch}
                    disabled={!canManage || busy || loading || validating}
                    onChange={(event) => setBranch(event.target.value)}
                  />
                </label>
                <label>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Base path</div>
                  <input
                    className="input h-9 min-h-0 w-full py-1.5 text-sm"
                    type="text"
                    placeholder="processmap/published"
                    value={basePath}
                    disabled={!canManage || busy || loading || validating}
                    onChange={(event) => setBasePath(event.target.value)}
                  />
                </label>
              </div>
              {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
              {success ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="secondaryBtn h-9 min-h-0 px-3 py-0 text-sm" disabled={busy || loading || validating}>
                    {busy ? "Сохранение…" : "Сохранить Git mirror"}
                  </button>
                  <button type="button" className="secondaryBtn h-9 min-h-0 px-3 py-0 text-sm" disabled={busy || loading || validating} onClick={() => void handleValidate()}>
                    {validating ? "Проверка…" : "Проверить конфигурацию"}
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-500">Недостаточно прав для изменения настроек Git mirror.</div>
              )}
            </form>
          )}
        </SectionCard>
      </div>

      <div className="lg:col-span-1">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Состояние публикации</div>
          <h3 className="mt-1 text-base font-semibold text-slate-950">Git mirror</h3>
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${healthTone(healthStatus)}`}>
            <div className="flex items-center gap-2">
              <span>Статус:</span>
              <StatusPill status={String(healthStatus || "unknown")} tone={healthStatus === "valid" ? "ok" : healthStatus === "invalid" ? "warn" : "default"} compact />
            </div>
            <div className="mt-1 text-xs">{healthMessage || "Нет диагностического сообщения."}</div>
          </div>
          <div className="mt-3 space-y-2">
            <ConfigLine label="Включен" value={enabled ? "Да" : "Нет"} />
            <ConfigLine label="Provider" value={provider || "—"} />
            <ConfigLine label="Repository" value={repository || "—"} />
            <ConfigLine label="Branch" value={branch || "—"} />
            <ConfigLine label="Base path" value={basePath || "—"} />
          </div>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="font-medium text-slate-800">Цель публикации</div>
            <div className="mt-1">{targetParts.join(" · ")}</div>
            {updatedAt > 0 ? <div className="mt-1">Обновлено: {new Date(updatedAt * 1000).toLocaleString("ru-RU")}</div> : null}
            {updatedBy ? <div className="mt-1">Кем: {updatedBy}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
