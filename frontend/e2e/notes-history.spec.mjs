import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken, withAuthHeaders } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function notesHistoryXml(name = "E2E notes history") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false" name="${name}">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Activity_1" name="Node Note Task" />
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
        <dc:Bounds x="280" y="128" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="500" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="216" y="168" />
        <di:waypoint x="280" y="168" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="420" y="168" />
        <di:waypoint x="500" y="168" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function responsePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

async function apiJson(res, label) {
  const txt = await res.text();
  let body = {};
  try {
    body = txt ? JSON.parse(txt) : {};
  } catch {
    body = { raw: txt };
  }
  expect(res.ok(), `${label}: ${txt}`).toBeTruthy();
  return body;
}

async function createFixture(request, runId, token) {
  const headers = withAuthHeaders(token);
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { title: `E2E notes history ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E notes history session ${runId}`,
        roles: ["Повар 1", "Повар 2"],
        start_role: "Повар 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers,
    data: { xml: notesHistoryXml(`E2E notes history ${runId}`) },
  });
  await apiJson(putRes, "put bpmn");
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
  await expect
    .poll(async () => await page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`).count())
    .toBe(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
}

async function openNotesSection(page) {
  const btn = page.locator(".sidebarQuickNavBtn").filter({ hasText: /NOTES/i }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function selectElementOnDiagram(page, elementId = "Activity_1") {
  await expect
    .poll(async () => await page.evaluate(() => !!window.__FPC_E2E_MODELER__))
    .toBeTruthy();
  const result = await page.evaluate((id) => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const eventBus = modeler.get("eventBus");
      const target = registry.get(id)
        || (registry.filter((el) => String(el?.type || "").toLowerCase().includes("task")) || [])[0];
      if (!target) return { ok: false, error: "target_missing" };
      eventBus.fire("element.click", { element: target });
      return { ok: true, id: String(target.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, elementId);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

test("Notes panel keeps global + node note history after reload without overwriting", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { accessToken } = await apiLogin(request);
  const fixture = await createFixture(request, runId, accessToken);

  await setUiToken(page, accessToken);
  await page.addInitScript(() => {
    window.sessionStorage?.setItem("ui.sidebar.left.open", "1");
  });

  const globalNote1 = `Global note 1 ${runId}`;
  const globalNote2 = `Global note 2 ${runId}`;
  const nodeNote1 = `Node note 1 ${runId}`;
  const nodeNote2 = `Node note 2 ${runId}`;

  await openFixture(page, fixture);
  await switchTab(page, "Diagram");
  await openNotesSection(page);

  const globalTextarea = page.locator('textarea[placeholder="Общая заметка..."]');
  await expect(globalTextarea).toBeVisible();

  await globalTextarea.fill(globalNote1);
  const noteReq1 = page.waitForResponse((res) => {
    return res.request().method() === "POST"
      && responsePath(res.url()) === `/api/sessions/${fixture.sessionId}/notes`;
  });
  await page.getByRole("button", { name: "Сохранить заметку" }).click();
  await noteReq1;

  await globalTextarea.fill(globalNote2);
  const noteReq2 = page.waitForResponse((res) => {
    return res.request().method() === "POST"
      && responsePath(res.url()) === `/api/sessions/${fixture.sessionId}/notes`;
  });
  await page.getByRole("button", { name: "Сохранить заметку" }).click();
  await noteReq2;

  const globalHistoryList = page.locator(".sidebarNotesBody .sidebarMiniList").first();
  await expect(globalHistoryList).toContainText(globalNote1);
  await expect(globalHistoryList).toContainText(globalNote2);

  await page.reload();
  await openFixture(page, fixture);
  await switchTab(page, "Diagram");
  await openNotesSection(page);
  const globalHistoryAfterReload = page.locator(".sidebarNotesBody .sidebarMiniList").first();
  await expect(globalHistoryAfterReload).toContainText(globalNote1);
  await expect(globalHistoryAfterReload).toContainText(globalNote2);

  await selectElementOnDiagram(page, "Activity_1");
  await openNotesSection(page);
  await page.getByRole("button", { name: "К узлу" }).click();

  const nodeTextarea = page.locator('textarea[placeholder="Заметка для выбранного узла..."]');
  await expect(nodeTextarea).toBeVisible();

  await nodeTextarea.fill(nodeNote1);
  const patchReq1 = page.waitForResponse((res) => {
    return res.request().method() === "PATCH"
      && responsePath(res.url()) === `/api/sessions/${fixture.sessionId}`;
  });
  await page.getByRole("button", { name: "Сохранить заметку" }).click();
  await patchReq1;

  await nodeTextarea.fill(nodeNote2);
  const patchReq2 = page.waitForResponse((res) => {
    return res.request().method() === "PATCH"
      && responsePath(res.url()) === `/api/sessions/${fixture.sessionId}`;
  });
  await page.getByRole("button", { name: "Сохранить заметку" }).click();
  await patchReq2;

  const nodeHistoryList = page.locator(".sidebarNotesBody .sidebarMiniList").first();
  await expect(nodeHistoryList).toContainText(nodeNote1);
  await expect(nodeHistoryList).toContainText(nodeNote2);

  await page.reload();
  await openFixture(page, fixture);
  await switchTab(page, "Diagram");
  await selectElementOnDiagram(page, "Activity_1");
  await openNotesSection(page);
  await page.getByRole("button", { name: "К узлу" }).click();
  const nodeHistoryAfterReload = page.locator(".sidebarNotesBody .sidebarMiniList").first();
  await expect(nodeHistoryAfterReload).toContainText(nodeNote1);
  await expect(nodeHistoryAfterReload).toContainText(nodeNote2);
});

