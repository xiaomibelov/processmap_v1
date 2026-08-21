import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

test("diagram toolbar overflow menu includes add-template action", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });

  await setUiToken(page, auth.accessToken, {
    activeOrgId: auth.activeOrgId,
    refreshToken: auth.refreshToken,
    refreshCookie: auth.refreshCookie,
  });

  if (auth.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }

  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page);

  // Select a task so the add-template action is enabled.
  const taskShape = page.locator('g[data-element-id="Task_1"]').first();
  await expect(taskShape).toBeVisible();
  await taskShape.click();

  const overflowToggle = page.locator('[data-testid="diagram-toolbar-overflow-toggle"]').first();
  await expect(overflowToggle).toBeVisible();
  await overflowToggle.click();

  const addTemplateItem = page.locator('[data-testid="diagram-add-template"]').first();
  await expect(addTemplateItem).toBeVisible();
  await expect(addTemplateItem).toContainText("Добавить шаблон");

  const openTemplatesItem = page.locator('[data-testid="diagram-open-templates"]').first();
  await expect(openTemplatesItem).toBeVisible();
});
