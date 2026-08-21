import { expect, test } from "@playwright/test";
import { apiLogin, withAuthHeaders } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const SESSION_ID = String(process.env.E2E_SESSION_ID || "").trim();
const PATH_ID = String(process.env.E2E_PATH_ID || "primary").trim();
const ORG_ID = String(process.env.E2E_ORG_ID || "").trim();

function parseJsonSafe(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function readSessionMeta(request, accessToken, sid) {
  const url = `${API_BASE}/api/sessions/${encodeURIComponent(sid)}`;
  const res = await request.get(url, { headers: withAuthHeaders(accessToken, ORG_ID ? { "X-Org-Id": ORG_ID } : {}) });
  const text = await res.text();
  if (!res.ok()) return { found: false, body: parseJsonSafe(text), status: res.status() };
  const body = parseJsonSafe(text);
  return {
    found: true,
    status: res.status(),
    body,
    projectId: String(body?.project_id || body?.projectId || "").trim(),
  };
}

async function listVersions(request, accessToken, sid, pid) {
  if (ORG_ID) {
    const endpoint = `${API_BASE}/api/orgs/${encodeURIComponent(ORG_ID)}/sessions/${encodeURIComponent(sid)}/reports/versions?path_id=${encodeURIComponent(pid)}`;
    const res = await request.get(endpoint, { headers: withAuthHeaders(accessToken, { "X-Org-Id": ORG_ID }) });
    if (!res.ok()) return [];
    const body = parseJsonSafe(await res.text());
    return Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : [];
  }
  const legacyUrl = `${API_BASE}/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports`;
  const res = await request.get(legacyUrl, { headers: withAuthHeaders(accessToken) });
  if (!res.ok()) return [];
  const body = parseJsonSafe(await res.text());
  return Array.isArray(body) ? body : [];
}

async function deleteVersion(request, accessToken, sid, pid, reportId) {
  if (ORG_ID) {
    const endpoint = `${API_BASE}/api/orgs/${encodeURIComponent(ORG_ID)}/sessions/${encodeURIComponent(sid)}/reports/${encodeURIComponent(reportId)}?path_id=${encodeURIComponent(pid)}`;
    const res = await request.delete(endpoint, { headers: withAuthHeaders(accessToken, { "X-Org-Id": ORG_ID }) });
    return Number(res.status() || 0);
  }
  const endpoint = `${API_BASE}/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports/${encodeURIComponent(reportId)}`;
  const res = await request.delete(endpoint, { headers: withAuthHeaders(accessToken) });
  return Number(res.status() || 0);
}

test("enterprise reports: delete version removes it from list", async ({ request }) => {
  const reportsDeleteEnabled = process.env.E2E_ENTERPRISE_REPORTS_DELETE === "1" || process.env.E2E_REPORTS_DELETE === "1";
  test.skip(!reportsDeleteEnabled, "Set E2E_ENTERPRISE_REPORTS_DELETE=1 or E2E_REPORTS_DELETE=1 to run enterprise report delete e2e.");
  if (!SESSION_ID) {
    throw new Error("E2E_SESSION_ID is required (must be provided by enterprise bootstrap)");
  }

  const auth = await apiLogin(request, { apiBase: API_BASE });
  const meta = await readSessionMeta(request, auth.accessToken, SESSION_ID);
  if (!meta.found) throw new Error(`Session ${SESSION_ID} is unavailable`);
  if (!meta.projectId) throw new Error(`Session ${SESSION_ID} has no project_id`);

  const beforeRows = await listVersions(request, auth.accessToken, SESSION_ID, PATH_ID);
  if (beforeRows.length < 1) throw new Error(`No report versions to delete on path ${PATH_ID}`);
  const targetId = String(beforeRows[0]?.id || "").trim();
  const targetVersion = Number(beforeRows[0]?.version || 0);
  if (!targetId) throw new Error("Missing report version id");
  if (!(targetVersion > 0)) throw new Error("Missing report version number");

  const status = await deleteVersion(request, auth.accessToken, SESSION_ID, PATH_ID, targetId);
  expect([200, 204]).toContain(status);

  const afterRows = await listVersions(request, auth.accessToken, SESSION_ID, PATH_ID);
  const afterIds = new Set(afterRows.map((x) => String(x?.id || "").trim()));
  expect(afterIds.has(targetId)).toBeFalsy();
  expect(afterRows.some((x) => Number(x?.version || 0) === targetVersion)).toBeFalsy();
});
