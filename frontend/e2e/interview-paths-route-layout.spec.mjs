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

function parseTimeLabelToSec(metaRaw) {
  const text = String(metaRaw || "");
  const m = text.match(/time\s+([0-9]+):([0-9]{2})/i);
  if (m) {
    return Number(m[1]) * 60 + Number(m[2]);
  }
  const s = text.match(/time\s+([0-9]+)s/i);
  if (s) return Number(s[1]);
  return null;
}

test("Interview Paths mode renders 3-pane layout and supports jump actions", async ({ page, request }) => {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const sessionMeta = await readSessionMeta(request, auth.accessToken, SESSION_ID);
  test.skip(!sessionMeta.found, `Session ${SESSION_ID} not available: ${sessionMeta.reason}`);
  test.skip(!sessionMeta.projectId, `Session ${SESSION_ID} has no project_id`);

  await setUiToken(page, auth.accessToken);
  await openSession(page, sessionMeta.projectId, SESSION_ID);

  await page.getByTestId("interview-view-mode-paths-btn").click();
  await expect(page.getByTestId("interview-paths-mode")).toBeVisible();
  await expect(page.getByTestId("interview-paths-layout")).toBeVisible();
  await expect(page.getByTestId("interview-paths-left-rail")).toBeVisible();
  await expect(page.getByTestId("interview-paths-center-route")).toBeVisible();
  await expect(page.getByTestId("interview-paths-right-details")).toBeVisible();

  const altScenarioItems = page.locator("[data-testid^='paths-scenario-item-']").filter({ hasText: /P0 Alt/i });
  const altCount = await altScenarioItems.count();
  if (altCount >= 2) {
    await altScenarioItems.nth(1).click();
  } else if (altCount === 1) {
    await altScenarioItems.first().click();
  } else {
    await page.locator("[data-testid^='paths-scenario-item-']").first().click();
  }

  const activeScenario = page.locator(".interviewPathsScenarioRailItem.isActive").first();
  await expect(activeScenario).toBeVisible();
  const activeMeta = await activeScenario.locator(".interviewPathsScenarioRailMeta").textContent();
  const stepsMatch = String(activeMeta || "").match(/steps\s+(\d+)/i);
  expect(stepsMatch).not.toBeNull();
  const stepsFromScenario = Number(stepsMatch?.[1] || 0);
  expect(Number.isFinite(stepsFromScenario)).toBeTruthy();
  expect(stepsFromScenario).toBeGreaterThan(0);

  const routeStack = page.getByTestId("interview-paths-route-stack");
  await expect(routeStack).toHaveAttribute("data-total-rows", /\d+/);
  const routeTotalRows = Number(await routeStack.getAttribute("data-total-rows"));
  expect(routeTotalRows).toBe(stepsFromScenario);

  const initialTimeSec = parseTimeLabelToSec(activeMeta);
  const firstRouteNode = page.locator("[data-testid^='interview-paths-node-']").first();
  await expect(firstRouteNode).toBeVisible();
  const workInput = firstRouteNode.locator('input[placeholder="Work"]').first();
  await expect(workInput).toBeVisible();
  const currentWorkRaw = await workInput.inputValue();
  const currentWork = Number(currentWorkRaw || 0);
  const nextWork = Number.isFinite(currentWork) && currentWork > 0 ? currentWork + 1 : 1;
  await workInput.fill(String(nextWork));
  await workInput.press("Enter");

  await expect
    .poll(async () => {
      const txt = await page.locator(".interviewPathsScenarioRailItem.isActive .interviewPathsScenarioRailMeta").first().textContent();
      const nextTimeSec = parseTimeLabelToSec(txt || "");
      if (initialTimeSec === null || nextTimeSec === null) return String(txt || "");
      return nextTimeSec;
    }, { timeout: 6000 })
    .not.toBe(initialTimeSec === null ? String(activeMeta || "") : initialTimeSec);

  await firstRouteNode.click();
  await expect(page.locator(".interviewPathsDetailsCard")).toBeVisible();

  await page.getByTestId("interview-paths-jump-diagram").click();
  await expect(page.getByTestId("interview-diagram-mode")).toBeVisible();

  await page.getByTestId("interview-view-mode-paths-btn").click();
  await expect(page.getByTestId("interview-paths-mode")).toBeVisible();
  await page.getByTestId("interview-paths-jump-matrix").click();
  await expect(page.locator(".interviewTableWrap")).toBeVisible();
});
