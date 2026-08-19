import { useCallback, useEffect, useRef, useState } from "react";

import SectionCard from "../common/SectionCard";
import { asArray, asObject, toInt, toText } from "../../adminUtils";
import { getRun, getStatus, runCheck } from "../../../../lib/apiModules/endpointCheckApi";
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
} from "./endpointCheckModel";

const FILTERS = [
  { id: ENDPOINT_CHECK_FILTER_ALL, label: "Все" },
  { id: ENDPOINT_CHECK_FILTER_NEW, label: "Новые" },
  { id: ENDPOINT_CHECK_FILTER_FAILING, label: "Падающие" },
  { id: ENDPOINT_CHECK_FILTER_FIXED, label: "Починившиеся" },
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

export default function EndpointCheckWidget() {
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [active, setActive] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");
  const [runDetail, setRunDetail] = useState(null);
  const [filter, setFilter] = useState(ENDPOINT_CHECK_DEFAULT_FILTER);
  const [expandedKey, setExpandedKey] = useState("");
  const hadActiveRef = useRef(false);

  const loadStatus = useCallback(async () => {
    const res = await getStatus();
    if (!res?.ok) {
      setStatusError(errorText(res, "Не удалось загрузить статус проверки"));
      setLoading(false);
      return;
    }
    setStatusError("");
    const data = asObject(res.data);
    setActive(data.active && typeof data.active === "object" ? data.active : null);
    setLastRun(data.last_run && typeof data.last_run === "object" ? data.last_run : null);
    setLoading(false);
  }, []);

  const loadRunDetail = useCallback(async (runId) => {
    const id = toText(runId);
    if (!id) return;
    setResultsLoading(true);
    setResultsError("");
    const res = await getRun(id);
    if (!res?.ok) {
      setResultsError(errorText(res, "Не удалось загрузить результаты прогона"));
      setRunDetail(null);
    } else {
      setRunDetail(asObject(res.data));
    }
    setResultsLoading(false);
  }, []);

  // Первичная загрузка статуса.
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Поллинг: пока есть активный прогон — опрашиваем статус каждые 7 сек.
  useEffect(() => {
    if (!active) return undefined;
    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, ENDPOINT_CHECK_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [active, loadStatus]);

  // Прогон завершился — обновляем результаты, если блок открыт.
  useEffect(() => {
    const hadActive = hadActiveRef.current;
    hadActiveRef.current = Boolean(active);
    if (hadActive && !active && resultsOpen) {
      const id = toText(lastRun?.id);
      if (id) void loadRunDetail(id);
    }
  }, [active, lastRun, resultsOpen, loadRunDetail]);

  async function handleRun() {
    if (starting || active) return;
    setStarting(true);
    setNotice("");
    const res = await runCheck();
    if (res?.ok) {
      await loadStatus();
    } else if (Number(res?.status) === 409) {
      setNotice("Проверка уже выполняется");
      await loadStatus();
    } else {
      setNotice(errorText(res, "Не удалось запустить проверку"));
    }
    setStarting(false);
  }

  function toggleResults() {
    const next = !resultsOpen;
    setResultsOpen(next);
    if (next) {
      const id = toText(lastRun?.id);
      if (id) void loadRunDetail(id);
    }
  }

  const summary = buildEndpointCheckSummary(lastRun);
  const progress = asObject(active?.progress);
  const results = asArray(runDetail?.results);
  const visibleResults = filterEndpointCheckResults(results, filter);
  const coverage = buildNotScannedSummary(runDetail);
  const blindZoneVisible = coverage.blindZone.slice(0, 8);

  const action = (
    <div className="flex items-center gap-2">
      {summary.hasNewErrors ? (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-rose-300/70 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-800"
          title={`Новых ошибок после последнего прогона: ${summary.newErrors}`}
          aria-label={`Новых ошибок после последнего прогона: ${summary.newErrors}`}
          data-testid="endpoint-check-new-errors-badge"
        >
          <span>Новые ошибки</span>
          <span className="tabular-nums">{summary.newErrors}</span>
        </span>
      ) : null}
      <button
        type="button"
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={handleRun}
        disabled={starting || Boolean(active)}
        data-testid="endpoint-check-run-button"
      >
        {active ? "Выполняется…" : starting ? "Запуск…" : "Запустить"}
      </button>
    </div>
  );

  return (
    <SectionCard
      title="Проверка эндпоинтов"
      subtitle="Регрессионный прогон read-only API с диффом против прошлого прогона"
      eyebrow="Quality"
      action={action}
    >
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-slate-500">Загрузка…</div>
        ) : statusError ? (
          <div className="text-xs text-rose-700">{statusError}</div>
        ) : (
          <>
            {active ? (
              <div className="text-xs text-slate-600" data-testid="endpoint-check-progress">
                Выполняется прогон{toText(active.run_id) ? ` ${toText(active.run_id)}` : ""}
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
                    {summary.newErrors} новых ошибок
                  </span>
                  {" · "}
                  <span className={summary.stillFailing > 0 ? "font-medium text-amber-700" : ""}>
                    {summary.stillFailing} всё ещё падают
                  </span>
                  {" · "}
                  <span>{summary.fixed} починились</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {summary.triggerLabel ? `Триггер: ${summary.triggerLabel}` : ""}
                  {summary.commitShort ? ` · ${summary.commitShort}` : ""}
                  {summary.branch ? ` (${summary.branch})` : ""}
                  {summary.finishedAt ? ` · ${formatEndpointCheckTs(summary.finishedAt)}` : ""}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Прогонов ещё не было</div>
            )}

            {notice ? <div className="text-xs text-amber-700">{notice}</div> : null}

            {summary.hasRun ? (
              <div>
                <button
                  type="button"
                  className="text-xs font-medium text-emerald-700 hover:underline"
                  onClick={toggleResults}
                  data-testid="endpoint-check-results-toggle"
                >
                  {resultsOpen ? "Скрыть результаты" : "Результаты последнего прогона"}
                </button>
              </div>
            ) : null}

            {resultsOpen ? (
              <div className="space-y-2" data-testid="endpoint-check-results">
                {resultsLoading ? (
                  <div className="text-xs text-slate-500">Загрузка результатов…</div>
                ) : resultsError ? (
                  <div className="text-xs text-rose-700">{resultsError}</div>
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

                    {visibleResults.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                        {results.length === 0 ? "Нет результатов прогона" : "Нет строк по выбранному фильтру"}
                      </div>
                    ) : (
                      <div className="overflow-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead className="sticky top-0 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
                            <tr>
                              <th className="px-2 py-1.5 font-medium">Эндпоинт</th>
                              <th className="px-2 py-1.5 font-medium">Был → стал</th>
                              <th className="px-2 py-1.5 font-medium">Latency</th>
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
                                          <div className="text-[11px] text-slate-400">Тело ответа не сохранено</div>
                                        )}
                                        {errorEvents.length > 0 ? (
                                          <div className="space-y-1">
                                            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                                              Связанные error-events
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
                          Вне сканирования: {coverage.mutationsCount} мутаций
                          {coverage.blindZone.length > 0 ? `, слепая зона: ${coverage.blindZone.length}` : ""}
                          {" — проверить руками"}
                        </div>
                        {blindZoneVisible.length > 0 ? (
                          <ul className="space-y-0.5">
                            {blindZoneVisible.map((row) => (
                              <li
                                key={row.operationId || `${row.method} ${row.path}`}
                                className="text-[11px] text-slate-500"
                              >
                                <span className="mr-1 text-slate-400">{row.method}</span>
                                {row.path || row.operationId}
                                {row.reason ? <span className="text-slate-400"> — {row.reason}</span> : null}
                              </li>
                            ))}
                            {coverage.blindZone.length > blindZoneVisible.length ? (
                              <li className="text-[11px] text-slate-400">
                                … и ещё {coverage.blindZone.length - blindZoneVisible.length}
                              </li>
                            ) : null}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  );
}
