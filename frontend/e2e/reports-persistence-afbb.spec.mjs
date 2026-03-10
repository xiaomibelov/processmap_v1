import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken, withAuthHeaders } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const SESSION_ID = String(process.env.E2E_SESSION_ID || "afbb609e19").trim();
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
  if (res.status() === 404) return { found: false, reason: "not_found", body: text };
  if (!res.ok()) return { found: false, reason: `status_${res.status()}`, body: text };
  const body = parseJsonSafe(text);
  const projectId = String(body?.project_id || body?.projectId || "").trim();
  return { found: true, body, projectId };
}

async function listReportsByPath(request, accessToken, sid, pid) {
  const url = `${API_BASE}/api/sessions/${encodeURIComponent(sid)}/paths/${encodeURIComponent(pid)}/reports`;
  const res = await request.get(url, { headers: withAuthHeaders(accessToken) });
  if (!res.ok()) return [];
  const text = await res.text();
  const payload = parseJsonSafe(text);
  return Array.isArray(payload) ? payload : [];
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openSession(page, projectId, sid) {
  await page.goto("/app");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", String(projectId));
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${sid}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", sid);
  await switchTab(page, "Interview");
  await expect(page.locator(".interviewStage")).toBeVisible();
}

test("afbb609e19: report generation is persisted and survives reload", async ({ page, request }) => {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const sessionMeta = await readSessionMeta(request, auth.accessToken, SESSION_ID);
  test.skip(!sessionMeta.found, `Session ${SESSION_ID} not available: ${sessionMeta.reason}`);
  test.skip(!sessionMeta.projectId, `Session ${SESSION_ID} has no project_id`);

  const beforeRows = await listReportsByPath(request, auth.accessToken, SESSION_ID, PATH_ID);
  const beforeCount = beforeRows.length;

  await setUiToken(page, auth.accessToken);
  await openSession(page, sessionMeta.projectId, SESSION_ID);
  await page.getByTestId("interview-view-mode-paths-btn").click();
  await expect(page.getByTestId("interview-paths-mode")).toBeVisible();

  await page.getByRole("button", { name: /Отчёты/i }).first().click();
  await expect(page.getByTestId("interview-path-report-panel")).toBeVisible();

  await page.getByTestId("interview-paths-generate-report").click();

  await expect(
    page.getByText(/Сохранение версии v\d+: (успешно|с ошибкой)/i),
  ).toBeVisible({ timeout: 45000 });

  const afterRows = await listReportsByPath(request, auth.accessToken, SESSION_ID, PATH_ID);
  expect(afterRows.length).toBeGreaterThanOrEqual(beforeCount + 1);
  const latestVersion = Number(afterRows[0]?.version || 0);
  expect(latestVersion).toBeGreaterThan(0);

  await page.reload();
  await openSession(page, sessionMeta.projectId, SESSION_ID);
  await page.getByTestId("interview-view-mode-paths-btn").click();
  await page.getByRole("button", { name: /Отчёты/i }).first().click();
  await expect(page.getByTestId("interview-path-report-panel")).toBeVisible();
  await expect(page.getByText(new RegExp(`v${latestVersion}\\b`))).toBeVisible();
});
