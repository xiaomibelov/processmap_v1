import { chromium } from "playwright-core";
import {
  login,
  createBackendSession,
  openSession,
  selectTask,
  ensureSidebarOpen,
  expandCamundaPropertiesGroup,
  BASE_URL,
} from "./savePipelineE2EHelpers.mjs";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));

  await login(page);
  const sessionId = await createBackendSession(page);
  await openSession(page, sessionId);

  // Capture patch request after restore to ensure no CAS conflict.
  let patchRequest = null;
  let patchResponse = null;
  await page.route(/\/api\/sessions\/[^/]+\/?$/, async (route, request) => {
    if (request.method() === "PATCH") {
      patchRequest = { postData: request.postData() };
      const response = await route.fetch();
      patchResponse = { status: response.status(), body: await response.text() };
      await route.fulfill({ response });
    } else {
      await route.continue();
    }
  });

  // Open versions modal and check layout.
  await page.locator('[data-testid="diagram-toolbar-overflow-toggle"]').click();
  await page.waitForSelector('[data-testid="diagram-toolbar-overlay"]', { timeout: 5000 });
  await page.locator('[data-testid="bpmn-versions-open"]').click();
  await page.waitForTimeout(500);

  const modal = page.locator('[data-testid="bpmn-versions-modal"]');
  await modal.waitFor({ state: "visible", timeout: 10000 });
  const box = await modal.boundingBox();
  if (!box) throw new Error("modal bounding box not found");
  if (box.height < 480) throw new Error(`modal height ${box.height} < 480`);

  // Toggle technical versions and restore the first one.
  await page.locator('[data-testid="bpmn-versions-show-technical"]').click();
  const firstItem = page.locator('[data-testid="bpmn-version-item"]').nth(0);
  await firstItem.waitFor({ state: "visible", timeout: 10000 });
  await page.screenshot({ path: "/root/processmap_v1/scripts/e2e/version_modal_after_ui_fix.png", fullPage: false });
  await firstItem.locator('[data-testid="bpmn-version-restore"]').click();
  await page.waitForTimeout(1500);

  // Close modal.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Make a property change and save to trigger CAS-protected patch.
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  const { addProperty, clickSaveProperties } = await import("./savePipelineE2EHelpers.mjs");
  await addProperty(page, `restoretest${Date.now()}`, "value");
  await clickSaveProperties(page);
  await page.waitForTimeout(2000);

  if (!patchRequest) throw new Error("property patch request was not sent after restore");
  const patchBody = JSON.parse(patchRequest.postData || "{}");
  if (!Number.isFinite(patchBody.base_diagram_state_version) || patchBody.base_diagram_state_version < 0) {
    throw new Error(`patch missing valid base_diagram_state_version: ${JSON.stringify(patchBody)}`);
  }
  if (patchResponse && patchResponse.status === 409) {
    throw new Error(`patch returned 409 conflict after restore: ${patchResponse.body.slice(0, 200)}`);
  }

  console.log("ok: restore then save succeeded, base version", patchBody.base_diagram_state_version, "patch status", patchResponse?.status);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
