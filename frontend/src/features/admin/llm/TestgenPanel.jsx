import { useCallback, useEffect, useRef, useState } from "react";

import { apiAdminTestgenGetRun, apiAdminTestgenListRuns, apiAdminTestgenRun } from "../api/adminApi";
import ErrorState from "../components/common/ErrorState";
import SectionCard from "../components/common/SectionCard";
import StatusPill from "../components/common/StatusPill";
import { asArray, asObject, formatTs, toInt, toText } from "../adminUtils";
import { t } from "./i18n";
import {
  TESTGEN_ACTIVE_STATUSES,
  TESTGEN_LIMIT_OPTIONS,
  TESTGEN_POLL_INTERVAL_MS,
  TESTGEN_TAGS,
} from "./llmConstants";

function errorMessage(res, fallback) {
  const err = res?.error;
  if (err && typeof err === "object") return toText(err.message || err.code || fallback);
  return toText(err || fallback);
}

function statusTone(status) {
  const s = toText(status).toLowerCase();
  if (s === "done") return "ok";
  if (s === "failed") return "danger";
  if (TESTGEN_ACTIVE_STATUSES.includes(s)) return "warn";
  return "default";
}

function isActive(run) {
  return TESTGEN_ACTIVE_STATUSES.includes(toText(run?.status).toLowerCase());
}

export default function TestgenPanel() {
  const [tag, setTag] = useState("notes");
  const [limit, setLimit] = useState(5);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const timerRef = useRef(null);

  const loadRuns = useCallback(async () => {
    const res = await apiAdminTestgenListRuns({ limit: 20 });
    if (!res?.ok) {
      setError(errorMessage(res, "testgen_load_failed"));
      setRuns([]);
    } else {
      setError("");
      setRuns(asArray(asObject(res.data).items));
    }
    setLoading(false);
  }, []);

  // Первичная загрузка истории.
  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // Поллинг: пока есть активный запуск — опрашиваем его карточку + историю.
  useEffect(() => {
    const active = runs.find((row) => isActive(row));
    if (!active) {
      setActiveRunId("");
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return undefined;
    }
    const runId = toText(active.run_id);
    setActiveRunId(runId);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      void apiAdminTestgenGetRun(runId).then(() => loadRuns());
    }, TESTGEN_POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);

  async function startRun() {
    if (busy) return;
    setBusy(true);
    setActionError("");
    const res = await apiAdminTestgenRun({ tag, limit });
    if (!res?.ok) {
      setActionError(errorMessage(res, "testgen_run_failed"));
    } else {
      await loadRuns();
    }
    setBusy(false);
  }

  const activeRun = runs.find((row) => toText(row?.run_id) === activeRunId) || runs.find((row) => isActive(row)) || null;
  const hasActive = Boolean(activeRun);

  return (
    <div className="space-y-4" data-testid="testgen-panel">
      <SectionCard title={t("testgen.card.title")} subtitle={t("testgen.card.subtitle")}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span>{t("testgen.form.tag")}</span>
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              data-testid="testgen-tag-select"
              value={tag}
              onChange={(event) => setTag(toText(event.target.value))}
              disabled={busy || hasActive}
            >
              {TESTGEN_TAGS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            <span>{t("testgen.form.limit")}</span>
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              data-testid="testgen-limit-select"
              value={limit}
              onChange={(event) => setLimit(toInt(event.target.value, 5))}
              disabled={busy || hasActive}
            >
              {TESTGEN_LIMIT_OPTIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            data-testid="testgen-run-button"
            disabled={busy || hasActive || !tag}
            onClick={() => void startRun()}
          >
            {busy ? t("testgen.action.starting") : hasActive ? t("testgen.action.inProgress") : t("testgen.action.run")}
          </button>
        </div>
        {actionError ? (
          <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-testid="testgen-action-error">
            {actionError}
          </div>
        ) : null}
      </SectionCard>

      {activeRun ? (
        <SectionCard title={t("testgen.result.title")}>
          <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="testgen-result">
            <StatusPill status={toText(activeRun.status)} tone={statusTone(activeRun.status)} />
            <span className="text-slate-600">
              {toText(activeRun.tag)} × {toInt(activeRun.batch_limit, 0)}
            </span>
            <span className="text-xs text-slate-400">{formatTs(activeRun.created_at)}</span>
            {toText(activeRun.pr_url) ? (
              <a className="text-sm text-blue-600 underline" href={toText(activeRun.pr_url)} target="_blank" rel="noreferrer">
                {t("testgen.result.openPr")}
              </a>
            ) : null}
            {toText(activeRun.error) ? (
              <span className="text-xs text-rose-600">{toText(activeRun.error)}</span>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={t("testgen.history.title")} subtitle={t("testgen.history.subtitle")}>
        {loading ? (
          <div className="text-sm text-slate-500">{t("common.loading")}</div>
        ) : error ? (
          <ErrorState message={error} />
        ) : runs.length === 0 ? (
          <div className="text-sm text-slate-500" data-testid="testgen-history-empty">{t("testgen.history.empty")}</div>
        ) : (
          <table className="w-full text-left text-sm" data-testid="testgen-history-table">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-1.5 pr-3">{t("testgen.history.col.run")}</th>
                <th className="py-1.5 pr-3">{t("testgen.history.col.tag")}</th>
                <th className="py-1.5 pr-3">{t("testgen.history.col.limit")}</th>
                <th className="py-1.5 pr-3">{t("testgen.history.col.status")}</th>
                <th className="py-1.5 pr-3">{t("testgen.history.col.pr")}</th>
                <th className="py-1.5">{t("testgen.history.col.created")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((row) => (
                <tr key={toText(row?.run_id)} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 font-mono text-xs">{toText(row?.run_id)}</td>
                  <td className="py-1.5 pr-3">{toText(row?.tag)}</td>
                  <td className="py-1.5 pr-3">{toInt(row?.batch_limit, 0)}</td>
                  <td className="py-1.5 pr-3">
                    <StatusPill status={toText(row?.status)} tone={statusTone(row?.status)} compact />
                  </td>
                  <td className="py-1.5 pr-3">
                    {toText(row?.pr_url) ? (
                      <a className="text-blue-600 underline" href={toText(row?.pr_url)} target="_blank" rel="noreferrer">PR</a>
                    ) : "—"}
                  </td>
                  <td className="py-1.5 text-xs text-slate-500">{formatTs(row?.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
