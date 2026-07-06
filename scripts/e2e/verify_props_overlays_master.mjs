import { chromium } from "playwright-core";
import {
  login,
  createBackendSession,
  openSession,
  ensureSidebarOpen,
  expandCamundaPropertiesGroup,
  getAccessToken,
  BASE_URL,
  PROJECT_ID,
} from "./savePipelineE2EHelpers.mjs";

const SHOTS = "/root/obsidian/processmap/ProjectAtlas/ProcessMap/screenshots";
const ELEMENT_ID = "Task_polozhit_list";
const ELEMENT_NAME = "Положить лист";

const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_verify" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="${ELEMENT_ID}" name="${ELEMENT_NAME}">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="prop1" value="initial-value" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="${ELEMENT_ID}" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="${ELEMENT_ID}" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Diagram">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_verify">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="152" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${ELEMENT_ID}" bpmnElement="${ELEMENT_ID}">
        <dc:Bounds x="240" y="130" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_EndEvent_1" bpmnElement="EndEvent_1">
        <dc:Bounds x="452" y="152" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="170" />
        <di:waypoint x="240" y="170" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="380" y="170" />
        <di:waypoint x="452" y="170" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function createSessionWithBpmn(page) {
  const token = await getAccessToken(page);
  const createRes = await page.evaluate(
    async ({ projectId, token: t }) => {
      const res = await fetch(`/api/projects/${projectId}/sessions?mode=quick_skeleton`, {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: `verify-props-overlays ${Date.now()}` }),
      });
      return res.json();
    },
    { projectId: PROJECT_ID, token },
  );
  const sessionId = createRes?.session?.id || createRes?.id;
  const sessionBefore = await page.evaluate(
    async ({ sid, token: t }) => {
      const res = await fetch(`/api/sessions/${sid}`, { headers: { Authorization: `Bearer ${t}` } });
      return res.json();
    },
    { sid: sessionId, token },
  );
  const baseVersion = sessionBefore?.diagram_state_version ?? sessionBefore?.bpmn_xml_version ?? 0;
  const putRes = await page.evaluate(
    async ({ sessionId: sid, xml, token: t, version }) => {
      const res = await fetch(`/api/sessions/${sid}/bpmn`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ xml, base_diagram_state_version: version }),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    { sessionId, xml: BPMN_XML, token, version: baseVersion },
  );
  if (putRes.status >= 400) throw new Error(`BPMN PUT failed: ${putRes.status}`);
  return { sessionId, token };
}

async function selectElement(page) {
  const selector = `[data-element-id="${ELEMENT_ID}"].djs-shape`;
  await page.waitForSelector(selector, { timeout: 15000 });
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    await page.locator(selector).first().click({ force: true });
  } else {
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
  }
  await page.waitForTimeout(800);
}

async function captureState(page, label) {
  const shotPath = `${SHOTS}/verify-${label}.png`;
  await page.screenshot({ path: shotPath, fullPage: false });
  const counts = await page.evaluate(({ elementId }) => {
    const modeler = window.__FPC_E2E_MODELER__;
    let modelerPropCount = 0;
    let sidebarPropCount = 0;
    let overlayCount = 0;
    let overlayDomLegacy = 0;
    let overlayDomV2 = 0;
    let importCalls = 0;
    try {
      importCalls = window.__FPC_IMPORT_COUNT__ || 0;
      const el = modeler?.get?.("elementRegistry")?.get?.(elementId);
      const ext = el?.businessObject?.extensionElements;
      for (const entry of ext?.values || []) {
        if (String(entry?.$type || "").toLowerCase().includes("camunda:properties")) {
          modelerPropCount += (entry.values || []).length;
        }
      }
      overlayCount = modeler?.get?.("overlays")?.get?.({ element: elementId })?.length || 0;
      overlayDomLegacy = document.querySelectorAll(".fpc-overlay-property-card-host, .fpc-properties, .fpcPropertyTable").length;
      overlayDomV2 = document.querySelectorAll(".fpc-overlay-v2-host").length;
      sidebarPropCount = document.querySelectorAll('[data-testid="camunda-properties-group"] .sidebarBpmnPropertyItem').length;
    } catch {}
    return { modelerPropCount, sidebarPropCount, overlayCount, overlayDomLegacy, overlayDomV2, importCalls };
  }, { elementId: ELEMENT_ID });
  const viewport = await page.evaluate(() => {
    try { return window.__FPC_E2E_MODELER__?.get?.("canvas")?.viewbox?.() || null; } catch { return null; }
  });
  return { shotPath, ...counts, viewport };
}

async function enableLegacyOverlayOnly(page) {
  const toggles = {
    legacy: ["bpmn-show-properties-checkbox", "bpmn-show-properties-per-element-checkbox"],
    v2: ["bpmn-show-v2-overlays-checkbox", "bpmn-show-v2-overlays-expanded-checkbox"],
  };
  for (const testId of toggles.legacy) {
    const cb = page.locator(`[data-testid="${testId}"]`);
    if (await cb.isVisible().catch(() => false) && !(await cb.isChecked().catch(() => false))) await cb.click();
  }
  for (const testId of toggles.v2) {
    const cb = page.locator(`[data-testid="${testId}"]`);
    if (await cb.isVisible().catch(() => false) && (await cb.isChecked().catch(() => false))) await cb.click();
  }
  await page.waitForTimeout(600);
}

async function enableBothOverlays(page) {
  for (const testId of [
    "bpmn-show-properties-checkbox",
    "bpmn-show-properties-per-element-checkbox",
    "bpmn-show-v2-overlays-checkbox",
    "bpmn-show-v2-overlays-expanded-checkbox",
  ]) {
    const cb = page.locator(`[data-testid="${testId}"]`);
    if (await cb.isVisible().catch(() => false) && !(await cb.isChecked().catch(() => false))) await cb.click();
  }
  await page.waitForTimeout(600);
}

async function main() {
  const checks = [];
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DEBUG_BPMN__ = true;
    window.__FPC_IMPORT_COUNT__ = 0;
    try { window.localStorage?.setItem("fpc_debug_bpmn", "1"); } catch {}
  });
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));
  page.on("console", (msg) => console.log(`[console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[page error]", err));

  await login(page);
  const { sessionId } = await createSessionWithBpmn(page);
  await openSession(page, sessionId);
  await selectElement(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  await page.waitForTimeout(600);

  // Instrument import counter.
  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (modeler && !modeler.__importWrapped) {
      const orig = modeler.importXML.bind(modeler);
      modeler.importXML = async (...args) => {
        window.__FPC_IMPORT_COUNT__ = (window.__FPC_IMPORT_COUNT__ || 0) + 1;
        console.log("[IMPORT_XML] call #", window.__FPC_IMPORT_COUNT__);
        return orig(...args);
      };
      modeler.__importWrapped = true;
    }
  });

  // Verify 01: legacy overlay only -> 1 overlay.
  await enableLegacyOverlayOnly(page);
  const v1 = await captureState(page, "01-sidebar-1-property-legacy-overlay");
  checks.push({ name: "legacy overlay only count == 1", pass: v1.overlayDomLegacy === 1 && v1.overlayDomV2 === 0, value: v1 });

  // Verify 02: both overlays enabled -> 2 overlays (legacy + V2).
  await enableBothOverlays(page);
  const v2 = await captureState(page, "02-overlay-both");
  checks.push({ name: "both overlays count == 2", pass: v2.overlayDomLegacy === 1 && v2.overlayDomV2 === 1, value: v2 });

  // Verify 03: add a property -> save.
  const { addProperty, clickSaveProperties, deleteProperty } = await import("./savePipelineE2EHelpers.mjs");
  const viewportBefore = v2.viewport;
  await addProperty(page, "prop2", `added-${Date.now()}`);
  await clickSaveProperties(page);
  await page.waitForTimeout(2500);
  const v3 = await captureState(page, "03-after-add-save");
  checks.push({ name: "after add: sidebar props == 2", pass: v3.sidebarPropCount === 2, value: v3 });
  checks.push({ name: "after add: no extra importXML", pass: v3.importCalls === 0, value: v3 });
  const vpStable = viewportBefore && v3.viewport &&
    Math.abs(viewportBefore.x - v3.viewport.x) < 1 &&
    Math.abs(viewportBefore.y - v3.viewport.y) < 1 &&
    Math.abs(viewportBefore.scale - v3.viewport.scale) < 0.01;
  checks.push({ name: "after add: viewport preserved", pass: vpStable, value: { before: viewportBefore, after: v3.viewport } });

  // Verify 04: delete prop2 -> save.
  await deleteProperty(page, "prop2");
  await page.waitForTimeout(500);
  await clickSaveProperties(page);
  await page.waitForTimeout(2500);
  const v4 = await captureState(page, "04-after-delete");
  checks.push({ name: "after delete: sidebar props == 1", pass: v4.sidebarPropCount === 1, value: v4 });

  // Verify 05: reload page.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".bpmnStageHost", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await selectElement(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  await enableBothOverlays(page);
  const v5 = await captureState(page, "05-after-reload");
  checks.push({ name: "after reload: sidebar props == 1", pass: v5.sidebarPropCount === 1, value: v5 });
  checks.push({ name: "after reload: overlays == 2", pass: v5.overlayDomLegacy === 1 && v5.overlayDomV2 === 1, value: v5 });

  const report = { stand: BASE_URL, sessionId, elementId: ELEMENT_ID, elementName: ELEMENT_NAME, checks };
  const reportPath = "/root/processmap_v1/scripts/e2e/verify_props_overlays_report.json";
  await (await import("fs")).promises.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log("\n=== VERIFICATION REPORT ===");
  console.log(JSON.stringify(report, null, 2));
  const allPass = checks.every((c) => c.pass);
  console.log(`\nOverall: ${allPass ? "PASS" : "FAIL"}`);

  await browser.close();
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
