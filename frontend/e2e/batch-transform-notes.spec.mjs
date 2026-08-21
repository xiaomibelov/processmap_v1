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
    <bpmn:participant id="Participant_1" name="Batch Ops" processRef="Process_1" />
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
    <bpmn:userTask id="Task_1" name="Task One">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Task_2" name="Task Two">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Task_3" name="Task Three">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:userTask>
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
        <dc:Bounds x="120" y="60" width="1440" height="300" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_QC_di" bpmnElement="Lane_QC" isHorizontal="true">
        <dc:Bounds x="150" y="60" width="1410" height="300" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="210" y="190" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="340" y="168" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2">
        <dc:Bounds x="560" y="168" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_3_di" bpmnElement="Task_3">
        <dc:Bounds x="780" y="168" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="1020" y="190" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="246" y="208" />
        <di:waypoint x="340" y="208" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="460" y="208" />
        <di:waypoint x="560" y="208" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="680" y="208" />
        <di:waypoint x="780" y="208" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="900" y="208" />
        <di:waypoint x="1020" y="208" />
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
    data: { title: `E2E batch notes project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E batch notes session ${runId}`,
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
  await page.goto("/app");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
}

function countByRegex(xmlText, re) {
  return (String(xmlText || "").match(re) || []).length;
}

test("notes batch transform preview + apply rename/changeType with autosave", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);
  const sid = fixture.sessionId;

  const putSignals = [];
  page.on("response", (res) => {
    if (
      res.request().method() === "PUT"
      && responsePath(res.url()) === `/api/sessions/${sid}/bpmn`
      && res.status() === 200
    ) {
      putSignals.push(res.url());
    }
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_ai_ops", "1");
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await setUiToken(page, auth.accessToken);

  await openFixture(page, fixture);
  await switchTab(page, "Diagram");

  await expect(page.getByTestId("notes-batch-card")).toBeVisible();
  await page.getByTestId("notes-batch-toggle").click();
  await expect(page.getByTestId("notes-batch-input")).toBeVisible();

  await page.getByTestId("notes-batch-input").fill([
    "Переименуй: Task_1 -> Подготовить тару",
    "Переименуй: Task_2 -> Проверка температуры",
  ].join("\n"));
  await expect(page.getByTestId("notes-batch-preview-total")).toContainText("2");
  const putOne = page.waitForResponse((resp) =>
    resp.request().method() === "PUT"
      && responsePath(resp.url()) === `/api/sessions/${sid}/bpmn`
      && resp.status() === 200,
  );
  await page.getByTestId("notes-batch-apply").click();
  await putOne;
  await expect.poll(() => putSignals.length).toBeGreaterThan(0);

  await switchTab(page, "XML");
  let xml = await page.locator(".xmlEditorTextarea").first().inputValue();
  expect(xml).toContain("Подготовить тару");
  expect(xml).toContain("Проверка температуры");

  await switchTab(page, "Diagram");
  const boundsBefore = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return null;
    const registry = modeler.get("elementRegistry");
    const tasks = registry.filter?.((el) => /Task$/i.test(String(el?.type || ""))) || [];
    const target = tasks.find((el) => String(el?.businessObject?.name || "") === "Подготовить тару");
    if (!target) return null;
    return {
      width: Number(target.width || 0),
      height: Number(target.height || 0),
      x: Number(target.x || 0),
      y: Number(target.y || 0),
    };
  });
  expect(boundsBefore, "boundsBefore should exist").not.toBeNull();

  await page.getByTestId("notes-batch-input").fill("Все User Task сделать Service Task");
  await expect(page.getByTestId("notes-batch-preview-total")).toContainText("3");
  const putTwo = page.waitForResponse((resp) =>
    resp.request().method() === "PUT"
      && responsePath(resp.url()) === `/api/sessions/${sid}/bpmn`
      && resp.status() === 200,
  );
  await page.getByTestId("notes-batch-apply").click();
  await putTwo;
  await expect.poll(() => putSignals.length).toBeGreaterThan(1);

  await switchTab(page, "XML");
  xml = await page.locator(".xmlEditorTextarea").first().inputValue();
  const serviceTaskCount = countByRegex(xml, /<(?:\w+:)?serviceTask\b/gi);
  const userTaskCount = countByRegex(xml, /<(?:\w+:)?userTask\b/gi);
  expect(serviceTaskCount).toBeGreaterThanOrEqual(3);
  expect(userTaskCount).toBe(0);

  await switchTab(page, "Diagram");
  const boundsAfter = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return null;
    const registry = modeler.get("elementRegistry");
    const tasks = registry.filter?.((el) => /Task$/i.test(String(el?.type || ""))) || [];
    const target = tasks.find((el) => String(el?.businessObject?.name || "") === "Подготовить тару");
    if (!target) return null;
    return {
      width: Number(target.width || 0),
      height: Number(target.height || 0),
      x: Number(target.x || 0),
      y: Number(target.y || 0),
    };
  });
  expect(boundsAfter, "boundsAfter should exist").not.toBeNull();
  expect(Math.round(Number(boundsAfter.width || 0))).toBe(Math.round(Number(boundsBefore.width || 0)));
  expect(Math.round(Number(boundsAfter.height || 0))).toBe(Math.round(Number(boundsBefore.height || 0)));
});
