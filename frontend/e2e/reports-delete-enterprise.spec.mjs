import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken, withAuthHeaders } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const SESSION_ID = String(process.env.E2E_SESSION_ID || "").trim();
const PATH_ID = String(process.env.E2E_PATH_ID || "primary").trim();

function parseJsonSafe(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function readSessionMeta(request, accessToken, sid) {
  const url = `${API_BASE}/api/sessions/${encodeURIComponent(sid)}`;
  const res = await request.get(url, { headers: withAuthHeaders(accessToken) });
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
  const url = `${API_BASE}/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports`;
  const res = await request.get(url, { headers: withAuthHeaders(accessToken) });
  if (!res.ok()) return [];
  const body = parseJsonSafe(await res.text());
  return Array.isArray(body) ? body : [];
}

async function openSession(page, projectId, sid) {
  await page.goto("/app");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", String(projectId));
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value=\"${sid}\"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", sid);
  await page.getByTestId("interview-view-mode-paths-btn").click();
  await expect(page.getByTestId("interview-paths-mode")).toBeVisible();
}

test("enterprise reports: delete version removes it from list", async ({ page, request }) => {
  const reportsDeleteEnabled = process.env.E2E_ENTERPRISE_REPORTS_DELETE === "1" || process.env.E2E_REPORTS_DELETE === "1";
  test.skip(!reportsDeleteEnabled, "Set E2E_ENTERPRISE_REPORTS_DELETE=1 or E2E_REPORTS_DELETE=1 to run enterprise report delete e2e.");
  test.skip(!SESSION_ID, "Set E2E_SESSION_ID for report delete e2e.");

  const auth = await apiLogin(request, { apiBase: API_BASE });
  const meta = await readSessionMeta(request, auth.accessToken, SESSION_ID);
  test.skip(!meta.found, `Session ${SESSION_ID} is unavailable`);
  test.skip(!meta.projectId, `Session ${SESSION_ID} has no project_id`);

  const beforeRows = await listVersions(request, auth.accessToken, SESSION_ID, PATH_ID);
  test.skip(beforeRows.length < 1, `No report versions to delete on path ${PATH_ID}`);
  const targetId = String(beforeRows[0]?.id || "").trim();
  const targetVersion = Number(beforeRows[0]?.version || 0);
  test.skip(!targetId, "Missing version id");
  test.skip(!(targetVersion > 0), "Missing report version number");

  await setUiToken(page, auth.accessToken);
  await openSession(page, meta.projectId, SESSION_ID);

  await page.getByRole("button", { name: /Отчёты|Reports/i }).first().click();
  await expect(page.getByTestId("interview-path-report-panel")).toBeVisible();

  const row = page.locator(".interviewPathReportVersionItem").filter({ hasText: new RegExp(`v${targetVersion}\\b`) }).first();
  await expect(row).toBeVisible();
  await row.locator("button", { hasText: "⋯" }).click();

  const confirm = page.getByRole("button", { name: /^Удалить$/ });
  await expect(confirm).toBeVisible();
  await confirm.click();

  await expect(row).toHaveCount(0);

  const afterRows = await listVersions(request, auth.accessToken, SESSION_ID, PATH_ID);
  const afterIds = new Set(afterRows.map((x) => String(x?.id || "").trim()));
  expect(afterIds.has(targetId)).toBeFalsy();
});
