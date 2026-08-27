import { useCallback, useEffect, useRef, useState } from "react";

import ErrorState from "../components/common/ErrorState";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import { asArray, asObject, toInt, toText } from "../adminUtils";
import { getRun, getRuns, getStatus, runCheck } from "../../../lib/apiModules/endpointCheckApi.js";
import { t, tf } from "./i18n";
import {
  ENDPOINT_CHECK_DEFAULT_FILTER,
  ENDPOINT_CHECK_FILTER_ALL,
  ENDPOINT_CHECK_FILTER_FAILING,
  ENDPOINT_CHECK_FILTER_FIXED,
  ENDPOINT_CHECK_FILTER_NEW,
  ENDPOINT_CHECK_POLL_INTERVAL_MS,
  buildEndpointCheckSummary,
  buildNotScannedSummary,
  countEndpointCheckFilter,
  endpointCheckDiffLabel,
  filterEndpointCheckResults,
  formatEndpointCheckTransition,
  formatEndpointCheckTs,
  getEndpointCheckEmptyFilterState,
} from "./endpointCheckModel";

const FILTERS = [
  { id: ENDPOINT_CHECK_FILTER_ALL, label: t("endpointCheck.filter.all") },
  { id: ENDPOINT_CHECK_FILTER_NEW, label: t("endpointCheck.filter.new") },
  { id: ENDPOINT_CHECK_FILTER_FAILING, label: t("endpointCheck.filter.failing") },
  { id: ENDPOINT_CHECK_FILTER_FIXED, label: t("endpointCheck.filter.fixed") },
];

function errorText(res, fallback) {
  const err = res?.error;
  if (err && typeof err === "object") return toText(err.message || err.code || fallback);
  return toText(err || fallback);
}

function categoryClass(categoryRaw) {
  const c = toText(categoryRaw).toLowerCase();
  if (c === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (c === "timeout" || c === "conn_error") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function runStatusTone(status) {
  const s = toText(status).toLowerCase();
  if (s === "done") return "ok";
  if (s === "failed") return "danger";
  if (s === "running" || s === "pending" || s === "queued") return "warn";
  return "default";
}

function isActiveRun(run) {
  const s = toText(run?.status).toLowerCase();
  return s === "running" || s === "pending" || s === "queued";
}

export default function EndpointCheckPanel() {
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [active, setActive] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState("");
  const [runDetail, setRunDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [filter, setFilter] = useState(ENDPOINT_CHECK_DEFAULT_FILTER);
  const [expandedKey, setExpandedKey] = useState("");
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState("");
  const hadActiveRef = useRef(false);

  const loadStatus = useCallback(async () => {
    const res = await getStatus();
    if (!res?.ok) {
      setStatusError(errorText(res, t("endpointCheck.error.loadStatus")));
      setStatusLoading(false);
      return;
    }
    setStatusError("");
    const data = asObject(res.data);
    setActive(data.active && typeof data.active === "object" ? data.active : null);
    setLastRun(data.last_run && typeof data.last_run === "object" ? data.last_run : null);
    setStatusLoading(false);
  }, []);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    const res = await getRuns({ limit: 20 });
    if (!res?.ok) {
      setRunsError(errorText(res, t("endpointCheck.error.loadHistory")));
      setRuns([]);
    } else {
      setRunsError("");
      setRuns(asArray(asObject(res.data).items));
    }
    setRunsLoading(false);
  }, []);

  const loadRunDetail = useCallback(async (runId) => {
    const id = toText(runId);
    if (!id) return;
    setDetailLoading(true);
    setDetailError("");
    const res = await getRun(id);
    if (!res?.ok) {
      setDetailError(errorText(res, t("endpointCheck.error.loadDetail")));
      setRunDetail(null);
    } else {
      setRunDetail(asObject(res.data));
    }
    setDetailLoading(false);
  }, []);

  // Первичная загрузка: статус, история и детализация последнего прогона.
  useEffect(() => {
    void loadStatus();
    void loadRuns();
  }, [loadStatus, loadRuns]);

  useEffect(() => {
    if (lastRun?.id && !active) {
      void loadRunDetail(lastRun.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRun?.id]);

  // Поллинг: пока есть активный прогон — опрашиваем статус.
  useEffect(() => {
    if (!active) return undefined;
    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, ENDPOINT_CHECK_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [active, loadStatus]);

  // Прогон завершился — обновляем результаты и историю.
  useEffect(() => {
    const hadActive = hadActiveRef.current;
    hadActiveRef.current = Boolean(active);
    if (hadActive && !active) {
      const id = toText(lastRun?.id);
      if (id) void loadRunDetail(id);
      void loadRuns();
    }
  }, [active, lastRun, loadRunDetail, loadRuns]);

  async function handleRun() {
    if (starting || active) return;
    setStarting(true);
    setNotice("");
    const res = await runCheck();
    if (res?.ok) {
      await loadStatus();
      await loadRuns();
    } else if (Number(res?.status) === 409) {
      setNotice(t("endpointCheck.notice.alreadyRunning"));
      await loadStatus();
    } else {
      setNotice(errorText(res, t("endpointCheck.error.startRun")));
    }
    setStarting(false);
  }

  const summary = buildEndpointCheckSummary(lastRun);
  const progress = asObject(active?.progress);
  const results = asArray(runDetail?.results);
  const visibleResults = filterEndpointCheckResults(results, filter);
  const coverage = buildNotScannedSummary(runDetail);
  const emptyState = getEndpointCheckEmptyFilterState(results, filter);
  const blindZoneVisible = coverage.blindZone.slice(0, 8);

  const action = (
    <div className="flex items-center gap-2">
      {summary.hasNewErrors ? (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-rose-300/70 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-800"
          title={tf("endpointCheck.badge.newErrorsTitle", { count: summary.newErrors })}
          aria-label={tf("endpointCheck.badge.newErrorsTitle", { count: summary.newErrors })}
          data-testid="endpoint-check-new-errors-badge"
        >
          <span>{t("endpointCheck.badge.newErrors")}</span>
          <span className="tabular-nums">{summary.newErrors}</span>
        </span>
      ) : null}
      <button
        type="button"
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => void handleRun()}
        disabled={starting || Boolean(active)}
        data-testid="endpoint-check-run-button"
      >
        {active ? t("endpointCheck.action.inProgress") : starting ? t("endpointCheck.action.starting") : t("endpointCheck.action.run")}
      </button>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="endpoint-check-panel">
      <SectionCard title={t("endpointCheck.card.title")} subtitle={t("endpointCheck.card.subtitle")} action={action}>
        {statusLoading ? (
          <div className="text-sm text-slate-500">{t("common.loading")}</div>
        ) : statusError ? (
          <ErrorState message={statusError} />
        ) : (
          <div className="space-y-3">
            {active ? (
              <div className="text-xs text-slate-600" data-testid="endpoint-check-progress">
                {t("endpointCheck.progress.running")}
                {toText(active.run_id) ? ` ${toText(active.run_id)}` : ""}
                {toInt(progress.total, 0) > 0
                  ? `: ${toInt(progress.scanned, 0)}/${toInt(progress.total, 0)}`
                  : "…"}
              </div>
            ) : null}

            {summary.hasRun ? (
              <div className="space-y-1">
                <div className="text-xs text-slate-700" data-testid="endpoint-check-summary">
                  <span className="font-medium text-emerald-700">{summary.ok} ok</span>
                  {" · "}
                  <span className={summary.newErrors > 0 ? "font-medium text-rose-700" : ""}>
                    {summary.newErrors} {t("endpointCheck.summary.newErrors")}
                  </span>
                  {" · "}
                  <span className={summary.stillFailing > 0 ? "font-medium text-amber-700" : ""}>
                    {summary.stillFailing} {t("endpointCheck.summary.stillFailing")}
                  </span>
                  {" · "}
                  <span>
                    {summary.fixed} {t("endpointCheck.summary.fixed")}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {summary.triggerLabel ? `${t("endpointCheck.summary.trigger")}: ${summary.triggerLabel}` : ""}
                  {summary.commitShort ? ` · ${summary.commitShort}` : ""}
                  {summary.branch ? ` (${summary.branch})` : ""}
                  {summary.finishedAt ? ` · ${formatEndpointCheckTs(summary.finishedAt)}` : ""}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">{t("endpointCheck.summary.empty")}</div>
            )}

            {notice ? (
              <div className="text-xs text-amber-700" data-testid="endpoint-check-notice">
                {notice}
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>

      {summary.hasRun ? (
        <SectionCard title={t("endpointCheck.result.title")}>
          <div className="space-y-2" data-testid="endpoint-check-results">
            {detailLoading ? (
              <div className="text-sm text-slate-500">{t("common.loading")}</div>
            ) : detailError ? (
              <ErrorState message={detailError} />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1">
                  {FILTERS.map((f) => {
                    const count = countEndpointCheckFilter(results, f.id);
                    const isActiveFilter = filter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          isActiveFilter
                            ? "border-slate-400 bg-slate-200 text-slate-900"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => setFilter(f.id)}
                        data-testid={`endpoint-check-filter-${f.id}`}
                      >
                        {f.label} · {count}
                      </button>
                    );
                  })}
                </div>

                {emptyState.isEmpty ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center">
                    <div className="text-xs text-slate-500" data-testid="endpoint-check-empty-message">
                      {emptyState.messageKey === "noNewErrors"
                        ? t("endpointCheck.result.noNewErrors")
                        : emptyState.messageKey === "noFilterRows"
                          ? t("endpointCheck.result.noFilterRows")
                          : t("endpointCheck.result.noResults")}
                    </div>
                    {emptyState.suggestAll ? (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-emerald-700 hover:underline"
                        onClick={() => setFilter(ENDPOINT_CHECK_FILTER_ALL)}
                        data-testid="endpoint-check-show-all"
                      >
                        {t("endpointCheck.result.showAll")}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-[0.14em] text-slate-400">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">{t("endpointCheck.result.col.endpoint")}</th>
                          <th className="px-2 py-1.5 font-medium">{t("endpointCheck.result.col.transition")}</th>
                          <th className="px-2 py-1.5 font-medium">{t("endpointCheck.result.col.latency")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleResults.map((row) => {
                          const item = asObject(row);
                          const key = toText(item.operation_id) || `${toText(item.method)} ${toText(item.path)}`;
                          const isExpanded = expandedKey === key;
                          const errorEvents = asArray(item.error_events);
                          return [
                            <tr
                              key={key}
                              className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                              onClick={() => setExpandedKey(isExpanded ? "" : key)}
                              data-testid={`endpoint-check-row-${key}`}
                            >
                              <td className="px-2 py-2 font-medium text-slate-950">
                                <span className="mr-1 text-slate-400">{toText(item.method).toUpperCase()}</span>
                                {toText(item.path || item.url_path)}
                              </td>
                              <td className="px-2 py-2">
                                <span className={`mr-1 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${categoryClass(item.category)}`}>
                                  {endpointCheckDiffLabel(item.diff_status)}
                                </span>
                                <span className="text-slate-500">{formatEndpointCheckTransition(item)}</span>
                              </td>
                              <td className="px-2 py-2 tabular-nums text-slate-500">
                                {toInt(item.latency_ms, 0)} ms
                              </td>
                            </tr>,
                            isExpanded ? (
                              <tr key={`${key}__detail`} className="border-t border-slate-100 bg-slate-50">
                                <td colSpan={3} className="px-2 py-2">
                                  <div className="space-y-2">
                                    {toText(item.note) ? (
                                      <div className="text-[11px] text-slate-600">{toText(item.note)}</div>
                                    ) : null}
                                    {toText(item.body_excerpt) ? (
                                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                                        {toText(item.body_excerpt)}
                                      </pre>
                                    ) : (
                                      <div className="text-[11px] text-slate-400">{t("endpointCheck.result.noBody")}</div>
                                    )}
                                    {errorEvents.length > 0 ? (
                                      <div className="space-y-1">
                                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                                          {t("endpointCheck.result.errorEvents")}
                                        </div>
                                        {errorEvents.map((evt) => {
                                          const event = asObject(evt);
                                          return (
                                            <div
                                              key={toText(event.event_id) || `${toText(event.fingerprint)}_${toText(event.occurred_at)}`}
                                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                                            >
                                              <div>{toText(event.message) || "—"}</div>
                                              <div className="text-[10px] text-slate-400">
                                                {toText(event.fingerprint) ? `fp ${toText(event.fingerprint)}` : ""}
                                                {toText(event.occurred_at) ? ` · ${formatEndpointCheckTs(event.occurred_at)}` : ""}
                                                {toText(event.request_id) ? ` · req ${toText(event.request_id)}` : ""}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ) : null,
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {coverage.hasAny ? (
                  <div className="space-y-1" data-testid="endpoint-check-not-scanned">
                    <div className="text-[11px] text-slate-400">
                      {tf("endpointCheck.notScanned.title", {
                        mutations: coverage.mutationsCount,
                        blind: coverage.blindZone.length,
                      })}
                    </div>
                    {blindZoneVisible.length > 0 ? (
                      <ul className="space-y-0.5">
                        {blindZoneVisible.map((row) => (
                          <li key={row.operationId || `${row.method} ${row.path}`} className="text-[11px] text-slate-500">
                            <span className="mr-1 text-slate-400">{row.method}</span>
                            {row.path || row.operationId}
                            {row.reason ? <span className="text-slate-400"> — {row.reason}</span> : null}
                          </li>
                        ))}
                        {coverage.blindZone.length > blindZoneVisible.length ? (
                          <li className="text-[11px] text-slate-400">
                            {tf("endpointCheck.notScanned.more", {
                              count: coverage.blindZone.length - blindZoneVisible.length,
                            })}
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={t("endpointCheck.history.title")} subtitle={t("endpointCheck.history.subtitle")}>
        {runsLoading ? (
          <div className="text-sm text-slate-500">{t("common.loading")}</div>
        ) : runsError ? (
          <ErrorState message={runsError} />
        ) : runs.length === 0 ? (
          <div className="text-sm text-slate-500" data-testid="endpoint-check-history-empty">
            {t("endpointCheck.history.empty")}
          </div>
        ) : (
          <table className="w-full text-left text-sm" data-testid="endpoint-check-history-table">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-1.5 pr-3">{t("endpointCheck.history.col.run")}</th>
                <th className="py-1.5 pr-3">{t("endpointCheck.history.col.trigger")}</th>
                <th className="py-1.5 pr-3">{t("endpointCheck.history.col.status")}</th>
                <th className="py-1.5 pr-3">{t("endpointCheck.history.col.counts")}</th>
                <th className="py-1.5">{t("endpointCheck.history.col.finished")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((row) => {
                const item = asObject(row);
                const diff = asObject(item.diff);
                const counts = asObject(item.counts);
                return (
                  <tr key={toText(item.id)} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 font-mono text-xs">{toText(item.id)}</td>
                    <td className="py-1.5 pr-3">{toText(item.trigger)}</td>
                    <td className="py-1.5 pr-3">
                      <StatusPill status={toText(item.status)} tone={runStatusTone(item.status)} compact />
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-slate-600">
                      {toInt(counts.ok, 0)} ok · {toInt(diff.new_error, 0) + toInt(diff.new_domain_error, 0)} new
                      {" · "}{toInt(diff.still_failing, 0) + toInt(diff.still_domain_error, 0)} fail
                      {" · "}{toInt(diff.fixed, 0) + toInt(diff.domain_fixed, 0)} fixed
                    </td>
                    <td className="py-1.5 text-xs text-slate-500">{formatEndpointCheckTs(item.finished_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
