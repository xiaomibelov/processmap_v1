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

function stableSnapshotView(snapshot) {
  const s = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    bpmnCounts: s?.counts?.bpmn || {},
    interviewCounts: s?.counts?.interview || {},
    tierCounts: s?.counts?.tiers || {},
    time: s?.time || {},
    laneCount: Array.isArray(s?.lanes) ? s.lanes.length : 0,
    stepsCount: Array.isArray(s?.steps) ? s.steps.length : 0,
  };
}

test("DoDSnapshot remains stable across Interview -> Diagram -> Interview", async ({ page, request }) => {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const sessionMeta = await readSessionMeta(request, auth.accessToken, SESSION_ID);
  test.skip(!sessionMeta.found, `Session ${SESSION_ID} not available: ${sessionMeta.reason}`);
  test.skip(!sessionMeta.projectId, `Session ${SESSION_ID} has no project_id`);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });

  await setUiToken(page, auth.accessToken);
  await openSession(page, sessionMeta.projectId, SESSION_ID);

  const snapA = await page.evaluate(() => window.__FPC_DOD_SNAPSHOT__ || null);
  expect(snapA).toBeTruthy();

  await switchTab(page, "Diagram");
  await expect(page.locator(".bpmnStageHost")).toBeVisible();
  await switchTab(page, "Interview");
  await expect(page.locator(".interviewStage")).toBeVisible();

  const snapB = await page.evaluate(() => window.__FPC_DOD_SNAPSHOT__ || null);
  expect(snapB).toBeTruthy();

  expect(stableSnapshotView(snapB)).toEqual(stableSnapshotView(snapA));
});
