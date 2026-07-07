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
        body: JSON.stringify({ title: `audit-props-overlays ${Date.now()}` }),
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

async function captureState(page, sessionId, token, label) {
  const shotPath = `${SHOTS}/audit-${label}.png`;
  await page.screenshot({ path: shotPath, fullPage: false });

  const counts = await page.evaluate(
    ({ elementId }) => {
      const modeler = window.__FPC_E2E_MODELER__;
      let modelerPropCount = 0;
      let modelerPropNames = [];
      let sidebarPropNames = [];
      let overlayCount = 0;
      let overlayDomLegacy = 0;
      let overlayDomV2 = 0;
      let sidebarPropCount = 0;
      let importCalls = 0;
      let error = null;
      try {
        importCalls = window.__FPC_IMPORT_COUNT__ || 0;
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
          ".fpc-overlay-property-card-host, .fpc-properties, .fpcPropertyTable"
        ).length;
        overlayDomV2 = document.querySelectorAll(".fpc-overlay-v2-host").length;
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
      return { modelerPropCount, modelerPropNames, sidebarPropCount, sidebarPropNames, overlayCount, overlayDomLegacy, overlayDomV2, importCalls, error };
    },
    { elementId: ELEMENT_ID },
  );

  let xmlPropCount = 0;
  let xmlProps = [];
  try {
    const res = await page.evaluate(
      async ({ sid, token: t }) => {
        const r = await fetch(`/api/sessions/${sid}/bpmn`, { headers: { Authorization: `Bearer ${t}` } });
        return { status: r.status, text: await r.text() };
      },
      { sid: sessionId, token },
    );
    if (res.status === 200) {
      const regex = new RegExp(`<bpmn:task[^>]*id="${ELEMENT_ID}"[\\s\\S]*?<\\/bpmn:task>`, "i");
      const match = res.text.match(regex);
      const block = match ? match[0] : "";
      xmlPropCount = (block.match(/<camunda:property /gi) || []).length;
      for (const m of block.matchAll(/<camunda:property name="([^"]*)" value="([^"]*)"\s*\/?>/gi)) {
        xmlProps.push({ name: m[1], value: m[2] });
      }
    }
  } catch (e) {
    console.error(`[${label}] XML fetch error`, e);
  }

  const viewport = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__;
    try {
      const canvas = modeler?.get?.("canvas");
      return canvas?.viewbox?.() || null;
    } catch {
      return null;
    }
  });

  return { shotPath, ...counts, xmlPropCount, xmlProps, viewport };
}

async function enableOverlays(page) {
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
}

async function editFirstPropertyValue(page) {
  const { clickSaveProperties } = await import("./savePipelineE2EHelpers.mjs");
  const firstRow = page.locator('[data-testid="camunda-properties-group"] .sidebarBpmnPropertyItem').first();
  await firstRow.locator(".sidebarBpmnPropertyEditBtn").click();
  await page.waitForTimeout(200);
  const inputs = firstRow.locator(".sidebarBpmnPropertyEditor input");
  const newValue = `edited-${Date.now()}`;
  await inputs.nth(1).fill(newValue);
  await clickSaveProperties(page);
  await page.waitForTimeout(2500);
  return newValue;
}

async function addSecondProperty(page) {
  const { addProperty, clickSaveProperties } = await import("./savePipelineE2EHelpers.mjs");
  await addProperty(page, "prop2", `added-${Date.now()}`);
  await clickSaveProperties(page);
  await page.waitForTimeout(2500);
}

async function main() {
  const networkLog = [];
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
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes("/bpmn") && (method === "PUT" || method === "POST")) {
      networkLog.push({ method, url, body: req.postData() });
    }
  });

  await login(page);
  const { sessionId, token } = await createSessionWithBpmn(page);
  await openSession(page, sessionId);
  await selectElement(page);
  await ensureSidebarOpen(page);
  await expandCamundaPropertiesGroup(page);
  await page.waitForTimeout(600);
  await enableOverlays(page);

  // Instrument importXML counter.
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

  const before = await captureState(page, sessionId, token, "a-01-before");
  const editedValue = await editFirstPropertyValue(page);
  const afterEdit = await captureState(page, sessionId, token, "a-02-after-edit-save");
  await addSecondProperty(page);
  const afterAdd = await captureState(page, sessionId, token, "a-03-after-add-save");

  const report = {
    stand: BASE_URL,
    sessionId,
    elementId: ELEMENT_ID,
    elementName: ELEMENT_NAME,
    before,
    afterEdit,
    afterAdd,
    network: networkLog.map((n) => ({ method: n.method, url: n.url, bodySnippet: n.body?.slice(0, 1200) })),
  };

  const reportPath = "/root/processmap_v1/scripts/e2e/audit_props_overlays_report.json";
  await (await import("fs")).promises.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log("\n=== AUDIT REPORT ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("Screenshots:", before.shotPath, afterEdit.shotPath, afterAdd.shotPath);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
