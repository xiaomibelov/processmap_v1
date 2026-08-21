import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken, withAuthHeaders } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const SESSION_ID = String(process.env.E2E_SESSION_ID || "afbb609e19").trim();

function parseJsonSafe(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function responsePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
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

async function readStepActionOrder(page, limit = 12) {
  const values = await page.locator('.interviewStepRow input[placeholder="Глагол + объект"]')
    .evaluateAll((nodes) => nodes.map((node) => String(node.value || "").trim()).filter(Boolean));
  return values.slice(0, limit);
}

test("afbb609e19: BPMN order is stable, reports do not fail, transitions stay responsive", async ({ page, request }) => {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const sessionMeta = await readSessionMeta(request, auth.accessToken, SESSION_ID);
  test.skip(!sessionMeta.found, `Session ${SESSION_ID} not available: ${sessionMeta.reason}`);
  test.skip(!sessionMeta.projectId, `Session ${SESSION_ID} has no project_id`);

  const reportStatuses = [];
  page.on("response", (res) => {
    const path = responsePath(res.url());
    if (res.request().method() !== "GET") return;
    if (!path.includes(`/api/sessions/${SESSION_ID}/paths/`) || !path.endsWith("/reports")) return;
    reportStatuses.push(Number(res.status() || 0));
  });

  await setUiToken(page, auth.accessToken);
  await openSession(page, sessionMeta.projectId, SESSION_ID);

  await page.getByTestId("interview-order-bpmn-btn").click();
  const orderBeforeReload = await readStepActionOrder(page, 14);
  expect(orderBeforeReload.length).toBeGreaterThan(3);

  await page.reload();
  await openSession(page, sessionMeta.projectId, SESSION_ID);
  await page.getByTestId("interview-order-bpmn-btn").click();
  const orderAfterReload = await readStepActionOrder(page, 14);
  expect(orderAfterReload).toEqual(orderBeforeReload);

  for (let i = 0; i < 2; i += 1) {
    await page.getByTestId("interview-view-mode-paths-btn").click();
    await expect(page.getByTestId("interview-paths-mode")).toBeVisible();
    await expect(page.getByTestId("interview-path-report-panel")).toBeVisible();

    await page.getByTestId("interview-view-mode-diagram-btn").click();
    await expect(page.getByTestId("interview-diagram-mode")).toBeVisible();

    await page.getByTestId("interview-view-mode-matrix-btn").click();
    await expect(page.locator(".interviewTableWrap")).toBeVisible();
  }

  await page.getByTestId("interview-view-mode-paths-btn").click();
  await expect(page.getByTestId("interview-paths-mode")).toBeVisible();
  await expect(page.locator(".interviewAnnotationNotice.err", { hasText: /404|Not Found/i })).toHaveCount(0);
  await expect(page.getByText(/Версий отчёта пока нет|v\d+/)).toBeVisible();

  if (reportStatuses.length) {
    expect(reportStatuses.some((status) => status === 404)).toBeFalsy();
  }
});

