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

async function ensureBranchesExpanded(stepRow) {
  const toggle = stepRow.locator(".interviewGatewayPreviewToggle").first();
  if (!(await toggle.isVisible().catch(() => false))) return;
  const text = String(await toggle.textContent()).trim().toLowerCase();
  if (text.includes("развернуть")) await toggle.click();
}

test("afbb609e19: gateway branches show nested non-primary steps and no leaked global indexes", async ({ page, request }) => {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const sessionMeta = await readSessionMeta(request, auth.accessToken, SESSION_ID);
  test.skip(!sessionMeta.found, `Session ${SESSION_ID} not available: ${sessionMeta.reason}`);
  test.skip(!sessionMeta.projectId, `Session ${SESSION_ID} has no project_id`);

  await setUiToken(page, auth.accessToken);
  await openSession(page, sessionMeta.projectId, SESSION_ID);

  const gatewayDeliveryRow = page.locator(".interviewStepRow", { hasText: /передать в доставку/i }).first();
  await expect(gatewayDeliveryRow).toBeVisible();
  const gatewayDeliveryPreview = gatewayDeliveryRow.locator("xpath=following-sibling::tr[contains(@class,'interviewBetweenBranchesRow')][1]");
  await expect(gatewayDeliveryPreview).toBeVisible();
  await ensureBranchesExpanded(gatewayDeliveryPreview);
  await expect(gatewayDeliveryPreview).toContainText(/Дальше по сценарию:\s*#7/i);
  await expect(gatewayDeliveryPreview).toContainText(/Нажать повторно.+Начать сборку/i);
  await expect(gatewayDeliveryPreview).toContainText(/↩\s*Возврат к шагу/i);
  await expect(gatewayDeliveryPreview).not.toContainText(/Дальше по сценарию:\s*#4\b/i);
  await expect(gatewayDeliveryPreview).not.toContainText(/#73\b/i);

  const gatewayContainerRow = page.locator(".interviewStepRow", { hasText: /какой вид тары/i }).first();
  await expect(gatewayContainerRow).toBeVisible();
  const gatewayContainerPreview = gatewayContainerRow.locator("xpath=following-sibling::tr[contains(@class,'interviewBetweenBranchesRow')][1]");
  await expect(gatewayContainerPreview).toBeVisible();
  await ensureBranchesExpanded(gatewayContainerPreview);
  await expect(gatewayContainerPreview).toContainText(/Открыть крышку/i);
  await expect(gatewayContainerPreview).toContainText(/Открыть пл[её]нку/i);
  await expect(gatewayContainerPreview).toContainText(/\d+\.[A-Z]\.1/);
  await expect(gatewayContainerPreview).not.toContainText(/#73\b/i);

  await page.screenshot({
    path: "e2e/screens/interview/gateway-between-branches-afbb.png",
    fullPage: true,
  });
});
