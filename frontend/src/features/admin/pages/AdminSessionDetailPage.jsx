import { useMemo, useState } from "react";

import AdminTabs from "../components/common/AdminTabs";
import KeyValueGrid from "../components/common/KeyValueGrid";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import SessionAuditTable from "../components/sessions/SessionAuditTable";
import SessionDiagnosticsSummary from "../components/sessions/SessionDiagnosticsSummary";
import SessionHealthGrid from "../components/sessions/SessionHealthGrid";
import SessionRawDiagnosticsAccordion from "../components/sessions/SessionRawDiagnosticsAccordion";
import SessionSummaryHeader from "../components/sessions/SessionSummaryHeader";
import SessionWarningsPanel from "../components/sessions/SessionWarningsPanel";
import { ADMIN_SESSION_TABS } from "../constants/adminTabs.constants";
import AdminPageContainer from "../layout/AdminPageContainer";
import { asArray, asObject, formatDurationSeconds, formatTs, toInt, toText, uniqueCount } from "../utils/adminFormat";

function buildVariantRows(rawAutoPass = {}) {
  const listed = asArray(rawAutoPass?.variants).map((variant) => ({ ...variant, wasListed: true }));
  const debugFailed = asArray(rawAutoPass?.debug_failed_variants).map((variant) => ({ ...variant, wasListed: false }));
  const map = new Map();
  [...listed, ...debugFailed].forEach((variant) => {
    const id = toText(variant?.variant_id);
    if (!id) return;
    if (!map.has(id) || map.get(id)?.wasListed !== true) map.set(id, variant);
  });
  return Array.from(map.values()).sort((a, b) => String(a?.variant_id || "").localeCompare(String(b?.variant_id || ""), "en"));
}

function buildVariantDebug(variant = {}) {
  const taskSteps = asArray(variant?.task_steps);
  const gatewayChoices = asArray(variant?.gateway_choices);
  const detailRows = asArray(variant?.detail_rows);
  const subprocessCount = taskSteps.filter((step) => toText(step?.bpmn_type).toLowerCase().includes("subprocess")).length;
  const teleportCount = variant?.teleport?.used ? 1 : 0;
  const strictFilterPassed = toText(variant?.status).toLowerCase() === "done" && Boolean(variant?.end_reached) && Boolean(toText(variant?.end_event_id));
  const shouldBeListed = strictFilterPassed;
  const wasListed = Boolean(variant?.wasListed);
  let finalVisibleStatus = "hidden";
  if (shouldBeListed && wasListed) finalVisibleStatus = "listed";
  else if (!shouldBeListed && wasListed) finalVisibleStatus = "listed_incorrectly";
  else if (shouldBeListed && !wasListed) finalVisibleStatus = "missing_from_list";
  const reason = toText(variant?.error?.message || variant?.error?.code)
    || (strictFilterPassed ? "Main process EndEvent reached; eligible for list." : "Filtered: no complete main-process path to EndEvent.");
  return {
    variantId: toText(variant?.variant_id || "—"),
    finalNode: toText(variant?.end_event_id || "—"),
    mainEndReached: Boolean(variant?.end_reached),
    strictFilterPassed,
    wasListed,
    shouldBeListed,
    gatewayChoices,
    countedSteps: taskSteps.length + gatewayChoices.length,
    subprocessCount,
    teleportCount,
    finalVisibleStatus,
    reason,
    totalDuration: formatDurationSeconds(variant?.total_duration_s),
    detailRows,
  };
}

export default function AdminSessionDetailPage({
  payload = {},
  loading = false,
  error = "",
  onBack,
  onNavigate,
}) {
  const [tab, setTab] = useState("overview");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const item = asObject(payload?.item);
  const tabs = asObject(item?.tabs);
  const overview = asObject(tabs?.overview);
  const diagnostics = asObject(tabs?.diagnostics);
  const rawAutoPass = asObject(diagnostics?.raw?.auto_pass);
  const variantRows = useMemo(() => buildVariantRows(rawAutoPass), [rawAutoPass]);
  const selectedVariant = useMemo(() => {
    if (toText(selectedVariantId)) return variantRows.find((row) => toText(row?.variant_id) === toText(selectedVariantId)) || variantRows[0];
    return variantRows.find((row) => !row?.wasListed) || variantRows[0] || {};
  }, [selectedVariantId, variantRows]);
  const variantDebug = useMemo(() => buildVariantDebug(selectedVariant), [selectedVariant]);
  const links = asObject(overview?.quick_links);
  const pathsBpmn = asObject(tabs?.paths_bpmn);
  const autopass = asObject(tabs?.autopass);
  const reportsDoc = asObject(tabs?.reports_doc);
  const audit = asObject(tabs?.audit);

  if (loading) {
    return <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">Loading session diagnostics…</div>;
  }
  if (toText(error)) {
    return <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">{toText(error)}</div>;
  }
  if (!toText(item?.session_id)) {
    return <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">Session not found.</div>;
  }

  const pathsIssues = [
    ...asArray(rawAutoPass?.warnings).map((row) => toText(row?.message || row?.code)),
    ...Object.entries(asObject(autopass?.filtered_reason)).map(([key, value]) => `${key}: ${value}`),
  ].filter(Boolean);

  return (
    <AdminPageContainer
      summary={<SessionSummaryHeader item={item} links={links} onBack={onBack} onNavigate={onNavigate} />}
      secondary={(
        <div className="grid gap-4 xl:grid-cols-2">
          <SessionDiagnosticsSummary diagnostics={diagnostics} />
          <SessionAuditTable items={audit?.items || []} />
          <SessionRawDiagnosticsAccordion payload={diagnostics?.raw || {}} />
        </div>
      )}
    >
      <SessionHealthGrid health={overview?.health || {}} />
      <AdminTabs tabs={ADMIN_SESSION_TABS} activeTab={tab} onChange={setTab} />

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SessionWarningsPanel warnings={overview?.warnings_errors || {}} />
          <SectionCard title="Integrity Checks" subtitle="Primary consistency view across session data" eyebrow="Checks">
            <KeyValueGrid
              items={[
                { label: "Session Status", value: <StatusPill status={item?.status} /> },
                { label: "Updated", value: formatTs(item?.updated_at) },
                { label: "Created", value: formatTs(item?.created_at) },
                { label: "Project", value: toText(item?.project_name || item?.project_id || "—") },
                { label: "Warnings", value: String(toInt(overview?.warnings_errors?.warnings_count, 0)) },
                { label: "Errors", value: String(toInt(overview?.warnings_errors?.errors_count, 0)) },
              ]}
            />
          </SectionCard>
          <SectionCard title="Recent Activity" subtitle="Operational timing view from current payload" eyebrow="Activity">
            <KeyValueGrid
              items={[
                { label: "Last Update", value: formatTs(item?.updated_at) },
                { label: "AutoPass Run", value: toText(autopass?.last_run || "—") },
                { label: "Run ID", value: toText(autopass?.run_id || "—") },
                { label: "Audit Rows", value: String(toInt(audit?.count, 0)) },
              ]}
            />
          </SectionCard>
          <SectionCard title="Quick Links" subtitle="Jump to related admin/editor surfaces" eyebrow="Navigation">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="secondaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.org))}>Open Org</button>
              <button type="button" className="secondaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.project))}>Open Project</button>
              <button type="button" className="primaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.editor))}>Open Editor</button>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {tab === "paths_bpmn" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Paths / BPMN Summary" subtitle="Counts and integrity gates currently derivable from payload" eyebrow="Graph">
            <KeyValueGrid
              items={[
                { label: "BPMN XML Version", value: String(toInt(pathsBpmn?.bpmn_xml_version, 0)) },
                { label: "Session Version", value: String(toInt(pathsBpmn?.version, 0)) },
                { label: "Paths Mapped", value: <StatusPill status={pathsBpmn?.paths_mapped ? "ok" : "missing"} tone={pathsBpmn?.paths_mapped ? "ok" : "warn"} /> },
                { label: "Path Artifacts", value: String(toInt(pathsBpmn?.path_artifacts_count, 0)) },
                { label: "Graph Fingerprint", value: toText(pathsBpmn?.graph_fingerprint || "—") },
                { label: "Unique Tasks", value: String(uniqueCount(variantRows.flatMap((row) => asArray(row?.task_steps)), (row) => row?.node_id)) },
                { label: "Unique Gateways", value: String(uniqueCount(variantRows.flatMap((row) => asArray(row?.gateway_choices)), (row) => row?.gateway_id)) },
                { label: "P0 / P1 / P2", value: "— / — / —", hint: "Not yet exposed by backend admin payload" },
              ]}
            />
          </SectionCard>
          <SectionCard title="Eligibility / Issues" subtitle="Main EndEvent and AutoPass eligibility posture" eyebrow="Validation">
            <KeyValueGrid
              items={[
                { label: "AutoPass Status", value: <StatusPill status={autopass?.status || "idle"} /> },
                { label: "End-Event Validation", value: <StatusPill status={autopass?.end_event_validation?.ok ? "ok" : "failed"} tone={autopass?.end_event_validation?.ok ? "ok" : "danger"} /> },
                { label: "Failed Reason", value: toText(autopass?.end_event_validation?.failed_reason || "—") },
                { label: "Warnings", value: String(asArray(rawAutoPass?.warnings).length) },
              ]}
            />
            <div className="mt-4 space-y-2">
              {pathsIssues.length ? pathsIssues.map((issue, idx) => (
                <div key={`${issue}_${idx}`} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {issue}
                </div>
              )) : <div className="text-sm text-slate-500">No explicit path/BPMN issues in current payload.</div>}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {tab === "autopass" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="AutoPass Run Summary" subtitle="Run-level semantics and visibility contract" eyebrow="Run">
            <KeyValueGrid
              items={[
                { label: "Run Status", value: <StatusPill status={autopass?.status || "idle"} /> },
                { label: "Run ID", value: toText(autopass?.run_id || "—") },
                { label: "Overwrite Of", value: toText(rawAutoPass?.overwrite_of || autopass?.overwrite_of || "—") },
                { label: "Overwrite Semantics", value: toText(autopass?.overwrite_semantics || "overwrite_on_start") },
                { label: "Done / Failed / Filtered", value: `${toInt(autopass?.done_failed_filtered?.total_variants_done, 0)} / ${toInt(autopass?.done_failed_filtered?.total_variants_failed, 0)} / ${toInt(autopass?.done_failed_filtered?.filtered_total, 0)}` },
                { label: "Selected Variant", value: toText(variantDebug?.variantId) },
              ]}
            />
            <div className="mt-4">
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-slate-400" htmlFor="admin-variant-select">
                Variant Drill-down
              </label>
              <select
                id="admin-variant-select"
                className="select h-11 min-h-0 rounded-2xl border-slate-200 bg-white"
                value={toText(variantDebug?.variantId)}
                onChange={(event) => setSelectedVariantId(event.target.value)}
              >
                {variantRows.map((variant) => (
                  <option key={toText(variant?.variant_id)} value={toText(variant?.variant_id)}>
                    {toText(variant?.variant_id)} {variant?.wasListed ? "· listed" : "· failed/debug"}
                  </option>
                ))}
              </select>
            </div>
          </SectionCard>
          <SectionCard title="Variant Visibility Debug" subtitle="Supports incident debugging such as afbb609e19 / V003" eyebrow="Variant">
            <KeyValueGrid
              items={[
                { label: "Final Node", value: variantDebug?.finalNode },
                { label: "Main EndEvent Reached", value: variantDebug?.mainEndReached ? "Yes" : "No" },
                { label: "Strict Filter Passed", value: variantDebug?.strictFilterPassed ? "Yes" : "No" },
                { label: "Was Listed", value: variantDebug?.wasListed ? "Yes" : "No" },
                { label: "Should Be Listed", value: variantDebug?.shouldBeListed ? "Yes" : "No" },
                { label: "Final Visible Status", value: variantDebug?.finalVisibleStatus },
                { label: "Reason", value: variantDebug?.reason },
                { label: "Counted Steps", value: String(variantDebug?.countedSteps || 0), hint: "Tasks + gateway choices only" },
                { label: "Subprocess Count", value: String(variantDebug?.subprocessCount || 0), hint: "Counted as task; not expanded" },
                { label: "Teleport Count", value: String(variantDebug?.teleportCount || 0), hint: "Must remain <= 1" },
                { label: "Duration", value: variantDebug?.totalDuration || "—" },
              ]}
              columnsClassName="md:grid-cols-2 xl:grid-cols-2"
            />
          </SectionCard>
          <SectionCard title="Gateway Choices" subtitle="Gateway decisions taken by selected variant" eyebrow="Choices">
            <div className="space-y-2">
              {variantDebug?.gatewayChoices?.length ? variantDebug.gatewayChoices.map((choice, idx) => (
                <div key={`${toText(choice?.gateway_id)}_${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  {toText(choice?.gateway_id)} → {toText(choice?.label || choice?.flow_id)}
                </div>
              )) : <div className="text-sm text-slate-500">No gateway choices for selected variant.</div>}
            </div>
          </SectionCard>
          <SectionCard title="Counted Steps / Detail Rows" subtitle="Task, gateway, teleport, and end-event rows for selected variant" eyebrow="Flow">
            <div className="space-y-2">
              {variantDebug?.detailRows?.length ? variantDebug.detailRows.map((row, idx) => (
                <div key={`${toText(row?.kind)}_${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <strong className="text-slate-950">{toText(row?.kind)}</strong>{" "}
                  {toText(row?.name || row?.node_id || row?.label || row?.flow_id || `${row?.from || ""} → ${row?.to || ""}`)}
                </div>
              )) : <div className="text-sm text-slate-500">No detail rows available for selected variant.</div>}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {tab === "reports_doc" ? (
        <SectionCard title="Reports / Doc" subtitle="Current reporting outputs and readiness" eyebrow="Outputs">
          <KeyValueGrid
            items={[
              { label: "Reports Versions", value: String(toInt(reportsDoc?.reports_versions, 0)) },
              { label: "Doc Version", value: String(toInt(reportsDoc?.doc_version, 0)) },
              { label: "Doc Ready", value: <StatusPill status={reportsDoc?.doc_ready ? "ready" : "missing"} tone={reportsDoc?.doc_ready ? "ok" : "warn"} /> },
            ]}
            columnsClassName="md:grid-cols-3"
          />
        </SectionCard>
      ) : null}

      {tab === "diagnostics" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Save / Retry History" subtitle="Persistence retries captured in diagnostics" eyebrow="Persist">
            <div className="space-y-2">
              {asArray(diagnostics?.save_retry_history).length ? asArray(diagnostics?.save_retry_history).map((row, idx) => (
                <div key={`retry_${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  {typeof row === "object" ? JSON.stringify(row) : String(row)}
                </div>
              )) : <div className="text-sm text-slate-500">No save/retry history rows.</div>}
            </div>
          </SectionCard>
          <SectionCard title="Lock Busy History" subtitle="409/423 contention diagnostics" eyebrow="Contention">
            <div className="space-y-2">
              {asArray(diagnostics?.lock_busy_history).length ? asArray(diagnostics?.lock_busy_history).map((row, idx) => (
                <div key={`lock_${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  {typeof row === "object" ? JSON.stringify(row) : String(row)}
                </div>
              )) : <div className="text-sm text-slate-500">No lock-busy history rows.</div>}
            </div>
          </SectionCard>
          <SectionCard title="Draw.io Warnings" subtitle="Overlay warnings should not block BPMN-first flow" eyebrow="Overlay">
            <div className="space-y-2">
              {asArray(diagnostics?.drawio_warnings).length ? asArray(diagnostics?.drawio_warnings).map((row, idx) => (
                <div key={`drawio_${idx}`} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {typeof row === "object" ? JSON.stringify(row) : String(row)}
                </div>
              )) : <div className="text-sm text-slate-500">No draw.io warnings.</div>}
            </div>
          </SectionCard>
          <SectionCard title="Template Warnings" subtitle="Template pack and apply warnings" eyebrow="Templates">
            <div className="space-y-2">
              {asArray(diagnostics?.template_apply_warnings).length ? asArray(diagnostics?.template_apply_warnings).map((row, idx) => (
                <div key={`tpl_${idx}`} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {typeof row === "object" ? JSON.stringify(row) : String(row)}
                </div>
              )) : <div className="text-sm text-slate-500">No template warnings.</div>}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {tab === "audit" ? <SessionAuditTable items={audit?.items || []} /> : null}
    </AdminPageContainer>
  );
}

