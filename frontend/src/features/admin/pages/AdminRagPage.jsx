import { useState } from "react";
import AdminPageContainer from "../layout/AdminPageContainer";
import SectionCard from "../components/common/SectionCard";
import { ru } from "../../../shared/i18n/ru";

const t = ru.admin.ragPage;

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-900 tabular-nums">{value ?? "—"}</span>
    </div>
  );
}

function GuardrailRow({ text }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="inline-block w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />
      <span className="text-xs text-slate-500">{text}</span>
    </div>
  );
}

function formatMsk(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(n * 1000));
  } catch {
    return "—";
  }
}

function IndexingPlanCard({ planPayload }) {
  const { data, loading, error } = planPayload || {};
  if (loading) {
    return <div className="text-xs text-slate-400 py-4 text-center">Загрузка…</div>;
  }
  if (error) {
    return <div className="text-xs text-rose-600 py-4 text-center">{error}</div>;
  }
  if (!data) return null;

  const schedule = data.schedule || {};
  const queue = data.queue || {};
  const readiness = data.readiness_counts || {};
  const indexSize = data.index_size || {};
  const preview = Array.isArray(queue.preview) ? queue.preview : [];

  return (
    <>
      <div className="divide-y divide-slate-100">
        <StatRow label={t.planScheduleLabel} value={t.planDaily} />
        <StatRow label={t.planNextRunLabel} value={formatMsk(schedule.next_run_at)} />
        <StatRow label={t.planTaskLabel} value={schedule.task || "—"} />
        <StatRow label={t.planQueueTotal} value={queue.total ?? 0} />
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-700 mb-2">
          {t.planPreviewTitle}
          {Number(queue.total || 0) > preview.length ? (
            <span className="ml-1 text-slate-400 font-normal">
              ({t.planPreviewTotalNote} {queue.total})
            </span>
          ) : null}
        </div>
        {preview.length === 0 ? (
          <div className="text-xs text-slate-400 py-3 text-center">{t.planEmptyQueue}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-1 pr-3 font-medium">{t.planColSession}</th>
                  <th className="py-1 pr-3 font-medium">{t.planColTitle}</th>
                  <th className="py-1 pr-3 font-medium">{t.planColQueuedAt}</th>
                  <th className="py-1 font-medium">{t.planColUpdatedAt}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.session_id} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-slate-500">{row.session_id}</td>
                    <td className="py-1.5 pr-3 text-slate-700">{row.title || "—"}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-slate-600">{formatMsk(row.rag_queued_at)}</td>
                    <td className="py-1.5 tabular-nums text-slate-600">{formatMsk(row.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-700 mb-1">{t.planReadinessTitle}</div>
        <StatRow label={t.planNotReady} value={readiness.not_ready} />
        <StatRow label={t.planQueued} value={readiness.queued} />
        <StatRow label={t.planIndexed} value={readiness.indexed} />
        <StatRow label={t.planError} value={readiness.error} />
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-700 mb-1">{t.planIndexSizeTitle}</div>
        <StatRow label={t.planDocuments} value={indexSize.documents} />
        <StatRow label={t.planActiveDocuments} value={indexSize.active_documents} />
        <StatRow label={t.planChunks} value={indexSize.chunks} />
      </div>

      <div className="mt-4 text-[11px] text-slate-400">{t.planDisclaimer}</div>
    </>
  );
}

function Toggle({ label, checked, onChange, disabled = false }) {

  return (
    <label className="flex items-center justify-between gap-4 py-2 cursor-pointer select-none">
      <span className="text-xs text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${checked ? "bg-blue-600" : "bg-slate-200"} ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </label>
  );
}

export default function AdminRagPage({ payload = {}, planPayload = {} }) {
  const { data, loading, error, saving, savedAt, saveError, save } = payload;

  const settings = data?.settings || {};
  const status = data?.status || {};

  const [form, setForm] = useState(null);
  const current = form || {
    enabled: settings.enabled ?? true,
    indexing_enabled: settings.indexing_enabled ?? true,
    default_top_k: settings.default_top_k ?? 10,
    max_top_k: settings.max_top_k ?? 50,
    default_min_score: settings.default_min_score ?? "",
    show_technical_fragments: settings.show_technical_fragments ?? false,
    allowed_source_types: settings.allowed_source_types ?? ["bpmn_xml", "product_action"],
  };

  function setField(key, value) {
    setForm((prev) => ({ ...(prev || current), [key]: value }));
  }

  function toggleSourceType(type) {
    const prev = current.allowed_source_types;
    const next = prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type];
    setField("allowed_source_types", next);
  }

  async function handleSave() {
    if (!save) return;
    const patch = {
      enabled: current.enabled,
      indexing_enabled: current.indexing_enabled,
      default_top_k: Number(current.default_top_k) || 10,
      max_top_k: Number(current.max_top_k) || 50,
      show_technical_fragments: current.show_technical_fragments,
      allowed_source_types: current.allowed_source_types,
    };
    const ms = current.default_min_score;
    if (ms !== "" && ms != null) patch.default_min_score = Number(ms);
    else patch.default_min_score = null;
    const r = await save(patch);
    if (r.ok) setForm(null);
  }

  if (loading) {
    return (
      <AdminPageContainer>
        <div className="text-sm text-slate-400 py-8 text-center">Загрузка…</div>
      </AdminPageContainer>
    );
  }

  if (error) {
    return (
      <AdminPageContainer>
        <div className="text-sm text-rose-600 py-8 text-center">{error}</div>
      </AdminPageContainer>
    );
  }

  return (
    <AdminPageContainer>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard eyebrow={t.statusEyebrow} title={t.statusTitle} subtitle={t.statusSubtitle}>
          <StatRow label={t.sourcesCount} value={status.sources_count} />
          <StatRow label={t.documentsCount} value={status.documents_count} />
          <StatRow label={t.activeDocumentsCount} value={status.active_documents_count} />
          <StatRow label={t.chunksCount} value={status.chunks_count} />
          <StatRow label={t.feedbackCount} value={status.feedback_count} />
          <StatRow label={t.evalCasesCount} value={status.eval_cases_count} />
        </SectionCard>

        <SectionCard eyebrow={t.planEyebrow} title={t.planTitle} subtitle={t.planSubtitle}>
          <IndexingPlanCard planPayload={planPayload} />
        </SectionCard>

        <SectionCard eyebrow={t.guardrailsEyebrow} title={t.guardrailsTitle} subtitle={t.guardrailsSubtitle}>
          <GuardrailRow text={t.guardrailReadOnly} />
          <GuardrailRow text={t.guardrailNoAutoApply} />
          <GuardrailRow text={t.guardrailNoEmbeddings} />
          <GuardrailRow text={t.guardrailNoBpmnMutation} />
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard eyebrow={t.settingsEyebrow} title={t.settingsTitle} subtitle={t.settingsSubtitle}>
          <div className="divide-y divide-slate-100">
            <Toggle label={t.enabledLabel} checked={!!current.enabled} onChange={(v) => setField("enabled", v)} />
            <Toggle label={t.indexingEnabledLabel} checked={!!current.indexing_enabled} onChange={(v) => setField("indexing_enabled", v)} />
            <Toggle label={t.showTechnicalFragmentsLabel} checked={!!current.show_technical_fragments} onChange={(v) => setField("show_technical_fragments", v)} />

            <div className="py-2 flex items-center justify-between gap-4">
              <label className="text-xs text-slate-700">{t.defaultTopKLabel}</label>
              <input
                type="number" min={1} max={100}
                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 text-right"
                value={current.default_top_k}
                onChange={(e) => setField("default_top_k", e.target.value)}
              />
            </div>

            <div className="py-2 flex items-center justify-between gap-4">
              <label className="text-xs text-slate-700">{t.maxTopKLabel}</label>
              <input
                type="number" min={1} max={100}
                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 text-right"
                value={current.max_top_k}
                onChange={(e) => setField("max_top_k", e.target.value)}
              />
            </div>

            <div className="py-2 flex items-center justify-between gap-4">
              <label className="text-xs text-slate-700">{t.minScoreLabel}</label>
              <input
                type="number" min={0} step={0.01}
                placeholder={t.minScorePlaceholder}
                className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 text-right placeholder:text-slate-300"
                value={current.default_min_score ?? ""}
                onChange={(e) => setField("default_min_score", e.target.value)}
              />
            </div>

            <div className="py-2">
              <div className="text-xs text-slate-700 mb-2">{t.allowedSourceTypesLabel}</div>
              <div className="flex flex-wrap gap-2">
                {["bpmn_xml", "product_action", "note_thread"].map((type) => (
                  <label key={type} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={current.allowed_source_types.includes(type)}
                      onChange={() => toggleSourceType(type)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-xs text-slate-600">{type}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {saveError ? (
            <div className="mt-3 text-xs text-rose-600">{saveError}</div>
          ) : null}
          {savedAt ? (
            <div className="mt-3 text-xs text-emerald-600">{t.saved}</div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? t.saving : t.saveBtn}
            </button>
          </div>
        </SectionCard>
      </div>
    </AdminPageContainer>
  );
}
