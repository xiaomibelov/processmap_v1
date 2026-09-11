import { apiRoutes } from "../apiRoutes.js";
import { apiRequest as request, okOrError } from "../apiCore.js";

// Единственная точка знания о контракте /api/admin/endpoint-check/*
// (админ-тег, право на бэке — как у кнопки «API Docs»).
// Если контракт при интеграции с backend разъедется — править только здесь.

function asDataObject(r) {
  return { ok: true, status: r.status, data: r.data && typeof r.data === "object" ? r.data : {} };
}

export async function runCheck() {
  // 202 {run_id, status, trigger} | 409 {detail: "scan_already_running", run_id} —
  // не-ok ответы (409/403/сеть) возвращаются как есть, с r.status и r.data.
  const r = okOrError(await request(apiRoutes.admin.endpointCheckRun(), { method: "POST" }));
  return r.ok ? asDataObject(r) : r;
}

export async function getStatus() {
  const r = okOrError(await request(apiRoutes.admin.endpointCheckStatus(), { method: "GET" }));
  return r.ok ? asDataObject(r) : r;
}

export async function getRuns({ limit, offset } = {}) {
  const params = {};
  if (Number.isFinite(Number(limit))) params.limit = Math.round(Number(limit));
  if (Number.isFinite(Number(offset))) params.offset = Math.round(Number(offset));
  const r = okOrError(await request(apiRoutes.admin.endpointCheckRuns(params), { method: "GET" }));
  return r.ok ? asDataObject(r) : r;
}

export async function getRun(runId) {
  const id = String(runId || "").trim();
  if (!id) return { ok: false, status: 0, error: "missing run_id" };
  const r = okOrError(await request(apiRoutes.admin.endpointCheckRunDetail(id), { method: "GET" }));
  return r.ok ? asDataObject(r) : r;
}
