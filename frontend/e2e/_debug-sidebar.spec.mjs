import { test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

test("debug sidebar after selecting task", async ({ page, request }) => {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  await setUiToken(page, auth.accessToken);
  await page.goto(`/app?project=${encodeURIComponent(process.env.E2E_PROJECT_ID || "")}&session=${encodeURIComponent(process.env.E2E_SESSION_ID || "")}`);
  await page.waitForTimeout(3000);

  const orgHeading = page.getByRole("heading", { name: "Выберите организацию" });
  if (await orgHeading.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /Default/i }).first().click();
    await page.waitForTimeout(3000);
  }

  await waitForDiagramReady(page);
  await page.click('[data-element-id="Task_audit"]');
  await page.waitForTimeout(2000);

  // Open sidebar if handle visible
  const handle = page.locator('[data-testid="left-sidebar-handle"]');
  if (await handle.isVisible().catch(() => false)) {
    await handle.locator(".leftSidebarHandleOpenBtn").first().click();
    await page.waitForTimeout(1000);
  }

  // Expand properties accordion
  const propsHead = page.locator("[data-section-id='properties'] .sidebarAccordionHead").first();
  if (await propsHead.isVisible().catch(() => false)) {
    await propsHead.click();
    await page.waitForTimeout(1000);
  }

  const sidebar = await page.locator("[data-testid='left-sidebar'], aside, .leftSidebar").first().innerHTML().catch(() => "no sidebar");
  const fs = await import("fs");
  fs.writeFileSync("/tmp/sidebar-html.html", sidebar);
  console.log("\n=== SIDEBAR HTML written to /tmp/sidebar-html.html ===");

  // Click add-property and dump form HTML.
  const addBtn = page.locator(".sidebarAddBtn").filter({ hasText: /Добавить BPMN-свойство/i }).first();
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(1500);
    const sidebarWithForm = await page.locator("[data-testid='left-sidebar'], aside, .leftSidebar").first().innerHTML().catch(() => "no sidebar");
    fs.writeFileSync("/tmp/sidebar-form-html.html", sidebarWithForm);
    console.log("\n=== SIDEBAR FORM HTML written to /tmp/sidebar-form-html.html ===");

    // Click edit on the newly created property row and dump edit form HTML.
    const editBtn = page.locator(".sidebarSchemaPropertyActionCell .sidebarPropertyActionBtn").filter({ has: page.locator('svg') }).first();
    const row = page.locator(".sidebarSchemaPropertyRow").filter({ hasText: /новое|Редактировать свойство/i }).first();
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
    } else if (await row.isVisible().catch(() => false)) {
      await row.click();
    }
    await page.waitForTimeout(1500);
    const sidebarEditForm = await page.locator("[data-testid='left-sidebar'], aside, .leftSidebar").first().innerHTML().catch(() => "no sidebar");
    fs.writeFileSync("/tmp/sidebar-edit-form-html.html", sidebarEditForm);
    console.log("\n=== SIDEBAR EDIT FORM HTML written to /tmp/sidebar-edit-form-html.html ===");
  } else {
    console.log("\n=== ADD BUTTON NOT FOUND ===");
  }
});
