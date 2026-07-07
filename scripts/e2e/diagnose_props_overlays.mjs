import { chromium } from "playwright-core";
import {
  login,
  createBackendSession,
  openSession,
  selectTask,
  ensureSidebarOpen,
  expandCamundaPropertiesGroup,
  getAccessToken,
  BASE_URL,
} from "./savePipelineE2EHelpers.mjs";

const SHOTS = "/root/processmap_v1/scripts/e2e/diagnose";

async function captureState(page, sessionId, token, label) {
  const shotPath = `${SHOTS}/${label}.png`;
  await page.screenshot({ path: shotPath, fullPage: false });

  const counts = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__;
    const elementId = "Task_verify";
    let modelerPropCount = 0;
    let modelerPropNames = [];
    let sidebarPropNames = [];
    let overlayCount = 0;
    let overlayDomLegacy = 0;
    let overlayDomV2 = 0;
    let sidebarPropCount = 0;
    let error = null;
    try {
      const elRegistry = modeler?.get?.("elementRegistry");
      const el = elRegistry?.get?.(elementId);
      const ext = el?.businessObject?.extensionElements;
      const values = ext?.values || [];
      for (const entry of values) {
        if (String(entry?.$type || "").toLowerCase().includes("camunda:properties")) {
          const items = entry.values || [];
          modelerPropCount += items.length;
          modelerPropNames = items.map((i) => String(i.name || ""));
        }
      }
      const overlays = modeler?.get?.("overlays");
      overlayCount = overlays?.get?.({ element: elementId })?.length || 0;
      overlayDomLegacy = document.querySelectorAll(
        '.fpc-overlay-property-card-host, .fpc-properties, .fpcPropertyTable'
      ).length;
      overlayDomV2 = document.querySelectorAll('.fpc-overlay-v2-host').length;
      sidebarPropCount = document.querySelectorAll(
        '[data-testid="camunda-properties-group"] .sidebarBpmnPropertyItem'
      ).length;
      sidebarPropNames = Array.from(
        document.querySelectorAll('[data-testid="camunda-properties-group"] .sidebarBpmnPropertyItem')
      ).map((row) => {
        const keyEl = row.querySelector(".sidebarBpmnPropertyPreviewKey");
        return keyEl ? keyEl.textContent.trim() : "";
      });
    } catch (e) {
      error = String(e);
    }
    return { modelerPropCount, modelerPropNames, sidebarPropCount, sidebarPropNames, overlayCount, overlayDomLegacy, overlayDomV2, error };
  });

  let xmlPropCount = 0;
  try {
    const res = await page.evaluate(
      async ({ sid, token: t }) => {
        const r = await fetch(`/api/sessions/${sid}/bpmn`, { headers: { Authorization: `Bearer ${t}` } });
        return { status: r.status, text: await r.text() };
      },
      { sid: sessionId, token }
    );
    if (res.status === 200) {
      const match = res.text.match(/<bpmn:task[^>]*id="Task_verify"[\s\S]*?<\/bpmn:task>/i);
      const block = match ? match[0] : "";
      xmlPropCount = (block.match(/<camunda:property /gi) || []).length;
    }
  } catch (e) {
    console.error(`[${label}] XML fetch error`, e);
  }

  return { shotPath, ...counts, xmlPropCount };
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("PROP_SYNC_MODELER")) {
      console.log("[BROWSER CONSOLE]", text);
    }
  });

  await login(page);
  const sessionId = await createBackendSession(page);
  const token = await getAccessToken(page);
  await openSession(page, sessionId);

  await selectTask(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  await page.waitForTimeout(600);

  // Enable property overlays and V2 overlays to reproduce multiplication.
  for (const testId of [
    "bpmn-show-properties-checkbox",
    "bpmn-show-properties-per-element-checkbox",
    "bpmn-show-v2-overlays-checkbox",
    "bpmn-show-v2-overlays-expanded-checkbox",
  ]) {
    const cb = page.locator(`[data-testid="${testId}"]`);
    if (await cb.isVisible().catch(() => false)) {
      if (!(await cb.isChecked().catch(() => false))) {
        await cb.click();
        await page.waitForTimeout(600);
      }
    }
  }

  const before = await captureState(page, sessionId, token, "01-before");

  const { clickSaveProperties } = await import("./savePipelineE2EHelpers.mjs");
  // Edit the first existing property value to reproduce duplication after skip-render save.
  const firstRow = page.locator('[data-testid="camunda-properties-group"] .sidebarBpmnPropertyItem').first();
  await firstRow.locator(".sidebarBpmnPropertyEditBtn").click();
  await page.waitForTimeout(200);
  const inputs = firstRow.locator(".sidebarBpmnPropertyEditor input");
  const newValue = `edited-${Date.now()}`;
  await inputs.nth(1).fill(newValue);
  await clickSaveProperties(page);
  await page.waitForTimeout(2500);

  const after = await captureState(page, sessionId, token, "02-after-save");

  // Prototype: sync modeler businessObject with server XML properties for Task_verify.
  const xmlRes = await page.evaluate(
    async ({ sid, token: t }) => {
      const r = await fetch(`/api/sessions/${sid}/bpmn`, { headers: { Authorization: `Bearer ${t}` } });
      return { status: r.status, text: await r.text() };
    },
    { sid: sessionId, token }
  );
  let desiredProps = [];
  if (xmlRes.status === 200) {
    const blockMatch = xmlRes.text.match(/<bpmn:task[^>]*id="Task_verify"[\s\S]*?<\/bpmn:task>/i);
    const block = blockMatch ? blockMatch[0] : "";
    const propMatches = block.matchAll(/<camunda:property name="([^"]*)" value="([^"]*)"\s*\/?>/gi);
    for (const m of propMatches) {
      desiredProps.push({ name: m[1], value: m[2] });
    }
  }
  await page.evaluate((props) => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return;
    try {
      const moddle = modeler.get("moddle");
      const modeling = modeler.get("modeling");
      const elementRegistry = modeler.get("elementRegistry");
      const el = elementRegistry.get("Task_verify");
      if (!el) return;
      const bo = el.businessObject;
      const existingExt = bo.extensionElements;
      const preserved = (existingExt?.values || []).filter((v) => {
        const type = String(v?.$type || "");
        return type !== "camunda:Properties" && type !== "camunda:ExecutionListener";
      });
      const camundaProps = moddle.create("camunda:Properties", {
        values: props.map((p) => moddle.create("camunda:Property", { name: p.name, value: p.value })),
      });
      const newExt = moddle.create("bpmn:ExtensionElements", { values: [...preserved, camundaProps] });
      modeling.updateProperties(el, { extensionElements: newExt });
    } catch (e) {
      console.error("modeler sync failed", e);
    }
  }, desiredProps);
  await page.waitForTimeout(800);
  const synced = await captureState(page, sessionId, token, "03-after-modeler-sync");

  console.log("=== DIAGNOSE REPORT ===");
  console.log(`Session: ${sessionId}`);
  console.log(`Before save:`);
  console.log(`  sidebar props = ${before.sidebarPropCount} names=${JSON.stringify(before.sidebarPropNames)} (expected 1)`);
  console.log(`  modeler props = ${before.modelerPropCount} names=${JSON.stringify(before.modelerPropNames)} (expected 1)`);
  console.log(`  xml props     = ${before.xmlPropCount} (expected 1)`);
  console.log(`  overlays (api) = ${before.overlayCount}, legacy dom = ${before.overlayDomLegacy}, v2 dom = ${before.overlayDomV2} (expected 1)`);
  console.log(`After save (edited existing property value):`);
  console.log(`  sidebar props = ${after.sidebarPropCount} names=${JSON.stringify(after.sidebarPropNames)} (expected 1)`);
  console.log(`  modeler props = ${after.modelerPropCount} names=${JSON.stringify(after.modelerPropNames)} (expected 1)`);
  console.log(`  xml props     = ${after.xmlPropCount} (expected 1)`);
  console.log(`  overlays (api) = ${after.overlayCount}, legacy dom = ${after.overlayDomLegacy}, v2 dom = ${after.overlayDomV2} (expected 1, not 3)`);
  console.log(`After in-place modeler sync:`);
  console.log(`  sidebar props = ${synced.sidebarPropCount} names=${JSON.stringify(synced.sidebarPropNames)} (expected 1)`);
  console.log(`  modeler props = ${synced.modelerPropCount} names=${JSON.stringify(synced.modelerPropNames)} (expected 1)`);
  console.log(`  overlays (api) = ${synced.overlayCount}, legacy dom = ${synced.overlayDomLegacy}, v2 dom = ${synced.overlayDomV2} (expected 1)`);
  console.log(`Screenshots: ${before.shotPath}, ${after.shotPath}, ${synced.shotPath}`);
  if (before.error) console.log(`before error: ${before.error}`);
  if (after.error) console.log(`after error: ${after.error}`);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
