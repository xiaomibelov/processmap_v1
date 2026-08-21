import { expect, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedBpmnXml(taskLabel = "Rollback seed task") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false" name="E2E rollback guard">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Activity_1" name="${taskLabel}" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="280" y="128" width="150" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="500" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="216" y="168" />
        <di:waypoint x="280" y="168" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="430" y="168" />
        <di:waypoint x="500" y="168" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function pathOf(urlString) {
  try {
    return new URL(urlString).pathname;
  } catch {
    return "";
  }
}

async function apiJson(res, opLabel) {
  const txt = await res.text();
  let body = {};
  try {
    body = txt ? JSON.parse(txt) : {};
  } catch {
    body = { raw: txt };
  }
  expect(res.ok(), `${opLabel}: ${txt}`).toBeTruthy();
  return body;
}

async function createFixture(request, runId, xmlUpdated) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E rollback project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E rollback session ${runId}`,
        roles: ["Повар 1", "Повар 2"],
        start_role: "Повар 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: xmlUpdated },
  });
  await apiJson(putRes, "put seed bpmn");

  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openFixture(page, fixture) {
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

async function waitForModelerReady(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__;
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        const canvas = modeler.get("canvas");
        const container = canvas?._container;
        const svg = container?.querySelector?.("svg");
        const svgRect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
        const count = Array.isArray(registry?.getAll?.()) ? registry.getAll().length : 0;
        return Number(svgRect.width || 0) > 0 && Number(svgRect.height || 0) > 0 && count > 0;
      });
    })
    .toBeTruthy();
}

async function readDiagramState(page, expectedLabel) {
  return await page.evaluate((label) => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, reason: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const all = registry.getAll?.() || [];
      const hasLabel = all.some((el) => String(el?.businessObject?.name || "") === String(label || ""));
      const canvas = modeler.get("canvas");
      const svg = canvas?._container?.querySelector?.("svg");
      const svgRect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
      return {
        ok: true,
        registryCount: all.length,
        hasLabel,
        svgRect: `${Math.round(Number(svgRect.width || 0))}x${Math.round(Number(svgRect.height || 0))}`,
      };
    } catch (error) {
      return { ok: false, reason: String(error?.message || error) };
    }
  }, expectedLabel);
}

test("Interview -> XML -> Diagram не откатывает draft.bpmn_xml при stale PATCH /sessions", async ({ page, request }) => {
  test.setTimeout(240_000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const seedLabel = `seed_${runId.slice(-4)}`;
  const updatedLabel = `updated_${runId.slice(-4)}`;
  const seedXml = seedBpmnXml(seedLabel);
  const updatedXml = seedBpmnXml(updatedLabel);
  const fixture = await createFixture(request, runId, updatedXml);
  const sid = fixture.sessionId;

  let phase = "setup";
  let getBpmnOnCycle = 0;
  page.on("request", (req) => {
    const p = pathOf(req.url());
    if (req.method() === "GET" && p === `/api/sessions/${sid}/bpmn` && phase === "cycle") {
      getBpmnOnCycle += 1;
    }
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_tabs", "1");
  });

  await openFixture(page, fixture);
  await waitForModelerReady(page);
  await switchTab(page, "XML");
  const baselineXmlArea = page.locator(".xmlEditorTextarea");
  await expect(baselineXmlArea).toContainText(updatedLabel);
  const baselineValue = await baselineXmlArea.inputValue();
  const baseline = { len: baselineValue.length, hash: fnv1aHex(baselineValue), xml: baselineValue };
  const seedHash = fnv1aHex(seedXml);
  expect(baseline.len).toBeGreaterThan(0);
  expect(baseline.hash).not.toBe(seedHash);
  expect(baseline.xml).toContain(updatedLabel);
  await switchTab(page, "Diagram");

  await page.route(`**/api/sessions/${sid}`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    const backend = await route.fetch();
    const bodyText = await backend.text();
    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = {};
    }
    body = body && typeof body === "object" ? body : {};
    body.bpmn_xml = seedXml;
    await route.fulfill({
      status: backend.status(),
      headers: { ...backend.headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  phase = "cycle";
  for (let i = 0; i < 10; i += 1) {
    await switchTab(page, "Interview");
    await page.waitForTimeout(i % 2 === 0 ? 60 : 120);
    await switchTab(page, "XML");
    const xmlArea = page.locator(".xmlEditorTextarea");
    await expect(xmlArea).toBeVisible();
    await expect(xmlArea).toContainText(updatedLabel);

    await switchTab(page, "Diagram");
    await expect
      .poll(async () => {
        const state = await readDiagramState(page, updatedLabel);
        return state.ok && state.registryCount > 0 && state.hasLabel && !String(state.svgRect || "").startsWith("0x");
      }, `cycle=${i + 1}`)
      .toBeTruthy();

    const snapXml = await xmlArea.inputValue();
    const snap = { len: snapXml.length, hash: fnv1aHex(snapXml), xml: snapXml };
    expect(snap.len).toBeGreaterThan(0);
    expect(snap.hash, `cycle=${i + 1}`).toBe(baseline.hash);
    expect(snap.xml).toContain(updatedLabel);
  }

  expect(getBpmnOnCycle).toBe(0);
});
