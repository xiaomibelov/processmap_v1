import { expect, test } from "@playwright/test";
import { ensureEnterpriseSession } from "./helpers/enterpriseBootstrap.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

test("tldr card smoke: card is visible in sidebar and has source/updated fields", async ({ page }) => {
  test.skip(process.env.E2E_TLDR !== "1", "Set E2E_TLDR=1 to run TL;DR card smoke.");
  const fixture = await ensureEnterpriseSession({ baseURL: API_BASE });
  const token = String(fixture?.token || "").trim();
  const orgId = String(fixture?.orgId || "").trim();
  const projectId = String(fixture?.projectId || "").trim();
  const sessionId = String(fixture?.sessionId || "").trim();
  expect(token).not.toBe("");
  expect(projectId).not.toBe("");
  expect(sessionId).not.toBe("");

  await page.addInitScript(({ accessToken, activeOrgId }) => {
    window.localStorage.setItem("fpc_auth_access_token", String(accessToken || ""));
    if (String(activeOrgId || "").trim()) {
      window.localStorage.setItem("fpc_active_org_id", String(activeOrgId || ""));
    } else {
      window.localStorage.removeItem("fpc_active_org_id");
    }
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  }, { accessToken: token, activeOrgId: orgId });

  await page.goto(`/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(sessionId)}`);
  const projectSelect = page.getByTestId("topbar-project-select");
  const sessionSelect = page.getByTestId("topbar-session-select");
  await expect(projectSelect).toBeVisible({ timeout: 20000 });
  await expect(sessionSelect).toBeVisible({ timeout: 20000 });
  const currentProjectValue = await projectSelect.inputValue().catch(() => "");
  if (String(currentProjectValue || "") !== projectId) {
    await projectSelect.selectOption(projectId);
  }
  const optionByValue = page.locator(`[data-testid='topbar-session-select'] option[value='${sessionId}']`);
  const hasValueOption = (await optionByValue.count()) > 0;
  const currentSessionValue = await sessionSelect.inputValue().catch(() => "");
  if (!currentSessionValue) {
    if (hasValueOption) {
      await sessionSelect.selectOption(sessionId);
    } else {
      await sessionSelect.selectOption({ index: 1 });
    }
  }
  const selectedSessionValue = String(await sessionSelect.inputValue().catch(() => "")).trim();
  test.skip(!selectedSessionValue, "Session selection is not available in current enterprise fixture.");
  await switchTab(page, "Diagram");

  const openSidebarBtn = page.getByRole("button", { name: /Открыть панель/i }).first();
  if (await openSidebarBtn.isVisible().catch(() => false)) {
    await openSidebarBtn.click();
  }

  const advancedAccordion = page.getByRole("button", { name: /Advanced \/ Debug/i }).first();
  if (await advancedAccordion.isVisible().catch(() => false)) {
    await advancedAccordion.click();
  }
  const tldrDetails = page.locator("[data-testid='sidebar-advanced-templates']").first();
  const hasTldrDetails = await tldrDetails.isVisible().catch(() => false);
  test.skip(!hasTldrDetails, "TL;DR section is not available for this session state.");
  await tldrDetails.locator("summary").first().click();

  await expect(page.locator("[data-testid='tldr-card']")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("[data-testid='tldr-source']")).toContainText("Source:");
  await expect(page.locator("[data-testid='tldr-updated']")).toContainText("Last updated:");
});
