import { test, expect } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const BASELINE_ACTIVITY_X = 320;

function seedBpmnXml(processName = "E2E autosave process") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="${processName}" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" name="Повар 1">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_2" name="Повар 2">
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_1" name="Шаг 1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="120" y="60" width="1100" height="380" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_1_di" bpmnElement="Lane_1" isHorizontal="true">
        <dc:Bounds x="150" y="60" width="1070" height="190" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_2_di" bpmnElement="Lane_2" isHorizontal="true">
        <dc:Bounds x="150" y="250" width="1070" height="190" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="220" y="135" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="${BASELINE_ACTIVITY_X}" y="112" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="850" y="316" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="256" y="153" />
        <di:waypoint x="320" y="153" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="440" y="153" />
        <di:waypoint x="645" y="153" />
        <di:waypoint x="645" y="334" />
        <di:waypoint x="850" y="334" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function countTasks(xmlText) {
  return (
    String(xmlText || "").match(
      /<(?:\w+:)?(?:task|userTask|serviceTask|sendTask|receiveTask|manualTask|scriptTask|businessRuleTask)\b/g,
    ) || []
  ).length;
}

function extractShapeX(xmlText, shapeId) {
  const src = String(xmlText || "");
  const safeShapeId = String(shapeId || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<(?:\\w+:)?BPMNShape[^>]*id="${safeShapeId}"[^>]*>[\\s\\S]*?<(?:\\w+:)?Bounds[^>]*x="([^"]+)"`,
    "i",
  );
  const hit = src.match(re);
  if (!hit) return Number.NaN;
  return Number(hit[1]);
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

async function switchTab(page, title) {
  const rx = new RegExp(`^${title}`);
  const btn = page.locator(".segBtn").filter({ hasText: rx }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function createSessionFixture(request, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E session ${runId}`,
        roles: ["Повар 1", "Повар 2"],
        start_role: "Повар 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: seedBpmnXml(`E2E process ${runId}`) },
  });
  await apiJson(putRes, "put bpmn");

  return { projectId, sessionId };
}

async function createEmptySessionFixture(request, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E empty project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create empty project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E empty session ${runId}`,
        roles: ["Повар 1", "Повар 2"],
        start_role: "Повар 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create empty session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  return { projectId, sessionId };
}

test("diagram edits persist across diagram/interview/xml tab cycles", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { projectId, sessionId } = await createSessionFixture(request, runId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();

  await page.selectOption(".topbar .topSelect--project", projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", sessionId);

  await switchTab(page, "Diagram");
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return !!window.__FPC_E2E_MODELER__;
      });
    })
    .toBeTruthy();

  const diagramMutateResult = await page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__;
    if (!m) return { ok: false, error: "modeler_missing" };
    try {
      const elementRegistry = m.get("elementRegistry");
      const modeling = m.get("modeling");
      const elementFactory = m.get("elementFactory");
      let sourceTask = elementRegistry.get("Activity_1")
        || (elementRegistry.filter?.((el) => String(el?.type || "").endsWith("Task")) || [])[0];
      if (!sourceTask) {
        const canvas = m.get("canvas");
        const root = canvas.getRootElement();
        if (!root) return { ok: false, error: "source_task_missing" };
        sourceTask = modeling.createShape(
          elementFactory.createShape({ type: "bpmn:Task" }),
          { x: 320, y: 180 },
          root,
        );
      }
      modeling.moveElements([sourceTask], { x: 180, y: 40 });
      modeling.updateLabel(sourceTask, "E2E updated task label");
      const appendedTask = elementFactory.createShape({ type: "bpmn:Task", businessObject: { name: "E2E added task" } });
      modeling.createShape(
        appendedTask,
        { x: Number(sourceTask.x || 0) + 320, y: Number(sourceTask.y || 0) + 60 },
        sourceTask.parent,
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(diagramMutateResult.ok, JSON.stringify(diagramMutateResult)).toBeTruthy();

  await switchTab(page, "Interview");
  await expect
    .poll(async () => {
      return await page
        .locator('.interviewTable input.input')
        .evaluateAll((els) =>
          els.some((el) => String(el.value || "").toLowerCase().includes("e2e updated task label")),
        );
    })
    .toBeTruthy();

  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  const xmlAfterDiagramEdit = await xmlArea.inputValue();
  expect(xmlAfterDiagramEdit.toLowerCase()).toContain("e2e updated task label");
  const taskCountAfterDiagramEdit = countTasks(xmlAfterDiagramEdit);
  const movedXAfterDiagramEdit = extractShapeX(xmlAfterDiagramEdit, "Activity_1_di");
  const movedAfterEdit = Number.isFinite(movedXAfterDiagramEdit) && Math.round(movedXAfterDiagramEdit) !== BASELINE_ACTIVITY_X;
  const appendedAfterEdit = taskCountAfterDiagramEdit >= 2;
  expect(movedAfterEdit || appendedAfterEdit).toBeTruthy();

  for (const tab of ["Interview", "XML", "Diagram", "Interview", "XML"]) {
    await switchTab(page, tab);
  }

  await expect(xmlArea).toBeVisible();
  await expect
    .poll(async () => {
      return (await xmlArea.inputValue()).length;
    })
    .toBeGreaterThan(20);
  const xmlAfterTabCycle = await xmlArea.inputValue();

  const taskCountAfterCycle = countTasks(xmlAfterTabCycle);
  if (appendedAfterEdit) {
    expect(taskCountAfterCycle).toBeGreaterThanOrEqual(taskCountAfterDiagramEdit);
  }
  expect(xmlAfterTabCycle.toLowerCase()).toContain("e2e updated task label");
});

test("new diagram element appears in interview timeline after diagram -> interview switch", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { projectId, sessionId } = await createEmptySessionFixture(request, runId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();

  await page.selectOption(".topbar .topSelect--project", projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", sessionId);

  await switchTab(page, "Diagram");
  await expect
    .poll(async () => {
      return await page.evaluate(() => !!window.__FPC_E2E_MODELER__);
    })
    .toBeTruthy();

  const createResult = await page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__;
    if (!m) return { ok: false, error: "modeler_missing" };
    try {
      const canvas = m.get("canvas");
      const elementFactory = m.get("elementFactory");
      const modeling = m.get("modeling");
      const root = canvas.getRootElement();
      if (!root) return { ok: false, error: "root_missing" };
      const task = elementFactory.createShape({ type: "bpmn:Task" });
      const created = modeling.createShape(task, { x: 360, y: 220 }, root);
      if (!created) return { ok: false, error: "create_shape_failed" };
      modeling.updateLabel(created, "E2E fresh task");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(createResult.ok, JSON.stringify(createResult)).toBeTruthy();

  await switchTab(page, "Interview");
  await expect
    .poll(async () => {
      return await page
        .locator(".interviewStepRow td:nth-child(2) .input, .interviewStepRow td:nth-child(3) .input, .interviewStepRow td:nth-child(4) .input, .interviewStepRow .input")
        .evaluateAll((els) =>
          els.some((el) => String(el.value || "").toLowerCase().includes("e2e fresh task")),
        );
    })
    .toBeTruthy();
});
