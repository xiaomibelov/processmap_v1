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

function parseProgress(textRaw) {
  const text = String(textRaw || "");
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return { current: 0, total: 0 };
  return {
    current: Number(match[1] || 0),
    total: Number(match[2] || 0),
  };
}

test("diagram playback reaches route end without reloading diagram", async ({ page, request }) => {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const sessionMeta = await readSessionMeta(request, auth.accessToken, SESSION_ID);
  test.skip(!sessionMeta.found, `Session ${SESSION_ID} not available: ${sessionMeta.reason}`);
  test.skip(!sessionMeta.projectId, `Session ${SESSION_ID} has no project_id`);

  await setUiToken(page, auth.accessToken);
  await page.goto("/app");
  const projectSelect = page.getByTestId("topbar-project-select");
  const sessionSelect = page.getByTestId("topbar-session-select");
  await expect(projectSelect).toBeVisible();
  await expect(sessionSelect).toBeVisible();
  await projectSelect.selectOption(String(sessionMeta.projectId));
  await expect(sessionSelect.locator(`option[value="${SESSION_ID}"]`)).toHaveCount(1, { timeout: 20000 });
  await sessionSelect.selectOption(SESSION_ID);

  const diagramTab = page.locator(".segBtn").filter({ hasText: /^Diagram$/i }).first();
  await expect(diagramTab).toBeVisible();
  await diagramTab.click();

  await page.getByTestId("diagram-action-playback").click();
  await expect(page.getByTestId("diagram-action-playback-popover")).toBeVisible();

  const progress = page.getByTestId("diagram-action-playback-progress");
  const hasProgress = await progress.count();
  test.skip(!hasProgress, "Playback route is empty for this session");

  await page.getByTestId("diagram-action-playback-speed").selectOption("4");
  await page.getByTestId("diagram-action-playback-play").click();

  await expect.poll(async () => {
    const text = await progress.textContent();
    const parsed = parseProgress(text);
    return parsed.current;
  }, { timeout: 90000 }).toBeGreaterThanOrEqual(3);

  await expect.poll(async () => {
    const typeText = await page.getByTestId("diagram-action-playback-event-type").textContent();
    return String(typeText || "").trim();
  }, { timeout: 90000 }).toMatch(/take_flow|enter_node|parallel_batch_begin|parallel_batch_end/);

  await expect.poll(async () => {
    const text = await progress.textContent();
    const parsed = parseProgress(text);
    if (!parsed.total) return "0/0";
    return `${parsed.current}/${parsed.total}`;
  }, { timeout: 90000 }).toMatch(/^(\d+)\/\1$/);
});
