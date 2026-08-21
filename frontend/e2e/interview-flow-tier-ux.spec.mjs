import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedTierXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_start_gate</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gateway_choice" name="Проверка">
      <bpmn:incoming>Flow_start_gate</bpmn:incoming>
      <bpmn:outgoing>Flow_yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_no</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_yes" name="Да-ветка">
      <bpmn:incoming>Flow_yes</bpmn:incoming>
      <bpmn:outgoing>Flow_yes_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_no" name="Нет-ветка">
      <bpmn:incoming>Flow_no</bpmn:incoming>
      <bpmn:outgoing>Flow_no_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_yes_end</bpmn:incoming>
      <bpmn:incoming>Flow_no_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_gate" sourceRef="StartEvent_1" targetRef="Gateway_choice" />
    <bpmn:sequenceFlow id="Flow_yes" sourceRef="Gateway_choice" targetRef="Task_yes" name="Да" />
    <bpmn:sequenceFlow id="Flow_no" sourceRef="Gateway_choice" targetRef="Task_no" name="Нет" />
    <bpmn:sequenceFlow id="Flow_yes_end" sourceRef="Task_yes" targetRef="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_no_end" sourceRef="Task_no" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="170" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_choice_di" bpmnElement="Gateway_choice">
        <dc:Bounds x="270" y="160" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_yes_di" bpmnElement="Task_yes">
        <dc:Bounds x="390" y="110" width="120" height="70" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_no_di" bpmnElement="Task_no">
        <dc:Bounds x="390" y="220" width="120" height="70" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="580" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_start_gate_di" bpmnElement="Flow_start_gate">
        <di:waypoint x="206" y="188" />
        <di:waypoint x="270" y="185" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_yes_di" bpmnElement="Flow_yes">
        <di:waypoint x="320" y="185" />
        <di:waypoint x="390" y="145" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_no_di" bpmnElement="Flow_no">
        <di:waypoint x="320" y="185" />
        <di:waypoint x="390" y="255" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_yes_end_di" bpmnElement="Flow_yes_end">
        <di:waypoint x="510" y="145" />
        <di:waypoint x="580" y="188" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_no_end_di" bpmnElement="Flow_no_end">
        <di:waypoint x="510" y="255" />
        <di:waypoint x="580" y="188" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
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

async function createFixture(request, runId, headers) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { title: `E2E flow tier ux ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E flow tier ux session ${runId}`,
        roles: ["Роль 1"],
        start_role: "Роль 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers,
    data: { xml: seedTierXml() },
  });
  await apiJson(putRes, "seed bpmn");
  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openFixture(page, fixture) {
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
}

async function selectElement(page, elementId) {
  const result = await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const eventBus = modeler.get("eventBus");
      const target = registry.get(targetId);
      if (!target) return { ok: false, error: `missing:${targetId}` };
      eventBus.fire("element.click", { element: target });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, elementId);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

test("flow tier UX: xor replacement and p1 dashed style", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_leftpanel_hidden", "0");
  });
  await setUiToken(page, auth.accessToken);
  await page.goto("/app");
  await openFixture(page, fixture);
  await switchTab(page, "Diagram");

  await selectElement(page, "Flow_yes");
  await expect(page.getByTestId("flow-tier-btn-P0")).toBeVisible();
  await page.getByTestId("flow-tier-btn-P0").click();

  await selectElement(page, "Flow_no");
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByTestId("flow-tier-btn-P0").click();
  await expect(page.locator("[data-section-id='selected']")).toContainText(/Нормализация|Замена P0/i);
  await page.screenshot({
    path: "e2e/screens/interview/flow-tier-xor-normalization.png",
    fullPage: true,
  });

  await page.getByTestId("flow-tier-btn-P1").click();
  await expect
    .poll(async () => page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__;
      if (!modeler) return "";
      const registry = modeler.get("elementRegistry");
      const connection = registry.get("Flow_no");
      if (!connection) return "";
      const gfx = registry.getGraphics(connection);
      const path = gfx?.querySelector?.(".djs-visual > path[data-corner-radius]");
      if (!(path instanceof SVGElement)) return "";
      const style = window.getComputedStyle(path);
      return String(style.strokeDasharray || "");
    }))
    .not.toBe("none");

  await page.screenshot({
    path: "e2e/screens/interview/diagram-flow-tier-p1-dashed.png",
    fullPage: true,
  });
});
