import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function responsePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function seedXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Binding Assistant" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_QC" name="Контроль качества">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_3</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Подготовить тару">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_2" name="Проверка температуры">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_3" name="Упаковка">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_4</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="Task_3" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_3" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="120" y="60" width="1500" height="300" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_QC_di" bpmnElement="Lane_QC" isHorizontal="true">
        <dc:Bounds x="150" y="60" width="1470" height="300" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="220" y="190" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="350" y="168" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2">
        <dc:Bounds x="620" y="168" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_3_di" bpmnElement="Task_3">
        <dc:Bounds x="890" y="168" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="1140" y="190" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="256" y="208" />
        <di:waypoint x="350" y="208" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="490" y="208" />
        <di:waypoint x="620" y="208" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="760" y="208" />
        <di:waypoint x="890" y="208" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="1030" y="208" />
        <di:waypoint x="1140" y="208" />
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
    data: { title: `E2E binding assistant ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E binding assistant session ${runId}`,
        roles: ["Контроль качества"],
        start_role: "Контроль качества",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers,
    data: { xml: seedXml() },
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

test("binding assistant binds interview step to BPMN node and persists after reload", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);
  const sid = fixture.sessionId;

  const patchSignals = [];
  page.on("response", (res) => {
    if (
      res.request().method() === "PATCH"
      && responsePath(res.url()) === `/api/sessions/${sid}`
      && res.status() === 200
    ) {
      patchSignals.push(res.url());
    }
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_trace", "1");
  });
  await setUiToken(page, auth.accessToken);

  await page.goto("/app");
  await openFixture(page, fixture);
  await switchTab(page, "Interview");
  await expect(page.locator(".interviewStage")).toBeVisible();

  const quickInput = page.locator(".interviewQuickStepInput");
  const stepNames = ["Подготовить тару", "Проверка температуры", "Упаковка"];
  for (const stepName of stepNames) {
    await quickInput.fill(stepName);
    await quickInput.press("Enter");
  }
  await expect(page.locator(".interviewStepRow")).toHaveCount(3);
  await expect.poll(() => patchSignals.length).toBeGreaterThan(0);

  await page.getByTestId("binding-assistant-open").click();
  await expect(page.getByTestId("binding-assistant-modal")).toBeVisible();
  await expect(page.getByTestId("binding-assistant-count")).toContainText("3");

  const firstIssue = page.locator('[data-testid="binding-assistant-issue"]').first();
  const stepId = String((await firstIssue.getAttribute("data-step-id")) || "");
  expect(stepId).not.toBe("");
  const firstBind = firstIssue.getByTestId("binding-assistant-bind").first();
  const nodeId = String((await firstBind.getAttribute("data-node-id")) || "");
  expect(nodeId).not.toBe("");

  const patchBeforeBind = patchSignals.length;
  await firstBind.click();
  await expect.poll(() => patchSignals.length).toBeGreaterThan(patchBeforeBind);

  const targetRow = page.locator(`.interviewStepRow[data-step-id="${stepId}"]`);
  await expect(targetRow).toBeVisible();
  const nodeSelect = targetRow.locator("select.interviewNodeBindSelect");
  await expect(nodeSelect).toHaveValue(nodeId);

  await page.reload({ waitUntil: "domcontentloaded" });
  await openFixture(page, fixture);
  await switchTab(page, "Interview");
  const targetRowAfterReload = page.locator(`.interviewStepRow[data-step-id="${stepId}"]`);
  await expect(targetRowAfterReload).toBeVisible();
  await expect(targetRowAfterReload.locator("select.interviewNodeBindSelect")).toHaveValue(nodeId);
});
