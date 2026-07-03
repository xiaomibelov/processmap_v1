import {
  BASE_URL,
  PROJECT_ID,
  BPMN_XML,
  login,
  createBackendSession,
  openSession,
  selectTask,
  ensureSidebarOpen,
  expandCamundaPropertiesGroup,
  verifyPropertyVisible,
  verifyPropertyAbsent,
  deleteProperty,
  addProperty,
  clickSaveProperties,
  getToastText,
  bumpServerVersion,
  getAccessToken,
  createBrowserContext,
  setupPage,
} from "./savePipelineE2EHelpers.mjs";

const SCENARIOS = [];
let currentScenario = null;

function scenario(name, fn) {
  SCENARIOS.push({ name, fn });
}

async function runScenario({ name, fn }) {
  currentScenario = name;
  const { browser, context } = await createBrowserContext();
  try {
    const page = await setupPage(context);
    await login(page);
    console.log(`\n=== SCENARIO: ${name} ===`);
    await fn(page, context);
    console.log(`[PASS] ${name}`);
    await browser.close();
  } catch (error) {
    console.error(`[FAIL] ${name}:`, error);
    try { await browser.close(); } catch {}
    throw error;
  }
}

scenario("property_delete_flow", async (page) => {
  const sessionId = await createBackendSession(page);
  await openSession(page, sessionId);
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);

  await verifyPropertyVisible(page, "fromXmlProp", "xml-value-42");
  await deleteProperty(page, "fromXmlProp");
  await verifyPropertyAbsent(page, "fromXmlProp");
  await clickSaveProperties(page);
  await page.waitForTimeout(1000);

  await page.reload();
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  await verifyPropertyAbsent(page, "fromXmlProp");
});

scenario("property_add_flow", async (page) => {
  const sessionId = await createBackendSession(page);
  await openSession(page, sessionId);
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);

  await verifyPropertyVisible(page, "fromXmlProp", "xml-value-42");
  await addProperty(page, "newProp", "new-value");
  await clickSaveProperties(page);
  await page.waitForTimeout(1000);

  await page.reload();
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  await verifyPropertyVisible(page, "newProp", "new-value");
});

scenario("property_conflict", async (page) => {
  const sessionId = await createBackendSession(page);
  await openSession(page, sessionId);
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);

  await verifyPropertyVisible(page, "fromXmlProp", "xml-value-42");
  await deleteProperty(page, "fromXmlProp");
  await verifyPropertyAbsent(page, "fromXmlProp");

  const token = await getAccessToken(page);
  await bumpServerVersion(sessionId, token);

  await clickSaveProperties(page);
  await page.waitForTimeout(2500);

  const toastText = await getToastText(page);
  console.log("[e2e] conflict toast:", toastText);
  if (!toastText.toLowerCase().includes("конфликт")) {
    throw new Error(`expected conflict toast, got "${toastText}"`);
  }

  const modal = page.locator('[data-testid="diagram-save-conflict-modal"]');
  await modal.waitFor({ state: "visible", timeout: 10000 });
  await page.locator('[data-testid="diagram-save-conflict-modal-stay"]').click();
  await page.waitForTimeout(1000);

  await verifyPropertyVisible(page, "fromXmlProp", "xml-value-42");
});

scenario("offline_save", async (page, context) => {
  const sessionId = await createBackendSession(page);
  await openSession(page, sessionId);
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);

  await verifyPropertyVisible(page, "fromXmlProp", "xml-value-42");

  await context.setOffline(true);
  await deleteProperty(page, "fromXmlProp");
  await verifyPropertyAbsent(page, "fromXmlProp");
  await clickSaveProperties(page);
  await page.waitForTimeout(1500);

  const errorToast = await getToastText(page);
  console.log("[e2e] offline error toast:", errorToast);
  if (errorToast.toLowerCase().includes("сохранено") && !errorToast.toLowerCase().includes("локально")) {
    throw new Error(`expected offline failure toast, got "${errorToast}"`);
  }

  await context.setOffline(false);
  // Reload to restore authoritative XML; the failed save was rolled back.
  await page.reload();
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  await verifyPropertyVisible(page, "fromXmlProp", "xml-value-42");

  await deleteProperty(page, "fromXmlProp");
  await verifyPropertyAbsent(page, "fromXmlProp");
  await clickSaveProperties(page);
  await page.waitForTimeout(1000);

  const successToast = await getToastText(page);
  console.log("[e2e] offline recovery toast:", successToast);
  if (!successToast.toLowerCase().includes("сохранено")) {
    throw new Error(`expected success toast after recovery, got "${successToast}"`);
  }

  await page.reload();
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  await verifyPropertyAbsent(page, "fromXmlProp");
});

async function run() {
  for (const s of SCENARIOS) {
    await runScenario(s);
  }
  console.log("\n[e2e] SUCCESS: all property CRUD scenarios passed");
}

run().catch((err) => {
  console.error("[e2e] FAILED", err);
  process.exit(1);
});
