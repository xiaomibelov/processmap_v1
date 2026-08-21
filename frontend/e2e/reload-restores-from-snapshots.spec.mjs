import { expect, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedBpmnXml(task3Label) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Snapshot restore process" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" name="Линия A">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_2</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_3</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_2" name="Линия B">
        <bpmn:flowNodeRef>Activity_4</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_5</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_6</bpmn:flowNodeRef>
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
    <bpmn:task id="Activity_2" name="Шаг 2">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_3" name="${task3Label}">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_4" name="Шаг 4">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_5" name="Шаг 5">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_6" name="Шаг 6">
      <bpmn:incoming>Flow_6</bpmn:incoming>
      <bpmn:outgoing>Flow_7</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_7</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="Activity_2" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Activity_2" targetRef="Activity_3" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Activity_3" targetRef="Activity_4" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Activity_4" targetRef="Activity_5" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Activity_5" targetRef="Activity_6" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Activity_6" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="80" y="50" width="1460" height="430" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_1_di" bpmnElement="Lane_1" isHorizontal="true">
        <dc:Bounds x="110" y="50" width="1430" height="210" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_2_di" bpmnElement="Lane_2" isHorizontal="true">
        <dc:Bounds x="110" y="260" width="1430" height="220" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="170" y="130" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1"><dc:Bounds x="250" y="108" width="140" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_2_di" bpmnElement="Activity_2"><dc:Bounds x="430" y="108" width="140" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_3_di" bpmnElement="Activity_3"><dc:Bounds x="610" y="108" width="140" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_4_di" bpmnElement="Activity_4"><dc:Bounds x="800" y="300" width="140" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_5_di" bpmnElement="Activity_5"><dc:Bounds x="980" y="300" width="140" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_6_di" bpmnElement="Activity_6"><dc:Bounds x="1160" y="300" width="140" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="1360" y="322" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="206" y="148" /><di:waypoint x="250" y="148" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="390" y="148" /><di:waypoint x="430" y="148" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="570" y="148" /><di:waypoint x="610" y="148" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4"><di:waypoint x="750" y="148" /><di:waypoint x="780" y="148" /><di:waypoint x="780" y="340" /><di:waypoint x="800" y="340" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5"><di:waypoint x="940" y="340" /><di:waypoint x="980" y="340" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6"><di:waypoint x="1120" y="340" /><di:waypoint x="1160" y="340" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_7_di" bpmnElement="Flow_7"><di:waypoint x="1300" y="340" /><di:waypoint x="1360" y="340" /></bpmndi:BPMNEdge>
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

async function createFixture(request, runId, xmlText) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E snapshot restore project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E snapshot restore session ${runId}`,
        roles: ["Линия A", "Линия B"],
        start_role: "Линия A",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: xmlText },
  });
  await apiJson(putRes, "put seed bpmn");

  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openFixture(page, fixture, options = {}) {
  if (!options?.skipGoto) {
    await page.goto("/");
  }
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

async function waitForDiagramReady(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        const all = registry?.getAll?.() || [];
        const canvas = modeler.get("canvas");
        const svg = canvas?._container?.querySelector?.("svg");
        const rect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
        return all.length > 0 && Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0;
      });
    })
    .toBeTruthy();
}

async function readXml(page) {
  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  return await xmlArea.inputValue();
}

test("reload restores latest diagram from local snapshots when backend rolled back", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const staleLabel = `STALE_${runId.slice(-4)}`;
  const latestLabel = `LATEST_${runId.slice(-4)}`;
  const staleXml = seedBpmnXml(staleLabel);
  const fixture = await createFixture(request, runId, staleXml);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_snapshots", "1");
  });

  await openFixture(page, fixture);
  await waitForDiagramReady(page);

  const mutate = await page.evaluate(({ label }) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const canvas = modeler.get("canvas");
      const registry = modeler.get("elementRegistry");
      const task = registry.get("Activity_3");
      if (!task) return { ok: false, error: "task_missing" };
      modeling.updateLabel(task, label);
      const root = task.parent || canvas.getRootElement();
      const newTask = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(task.x || 0) + 220, y: Number(task.y || 0) + 140 },
        root,
      );
      modeling.updateLabel(newTask, `Reload Snapshot ${label}`);
      return { ok: true, newTaskId: String(newTask.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { label: latestLabel });
  expect(mutate.ok, JSON.stringify(mutate)).toBeTruthy();

  await page.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(async () => (await readXml(page)).includes(latestLabel))
    .toBeTruthy();

  const latestXml = await readXml(page);
  expect(latestXml).toContain(latestLabel);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const rollbackRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn`, {
    data: { xml: staleXml },
  });
  await apiJson(rollbackRes, "force stale backend xml");

  await page.reload({ waitUntil: "domcontentloaded" });
  await openFixture(page, fixture, { skipGoto: true });
  await waitForDiagramReady(page);

  const xmlAfterReload = await readXml(page);
  expect(xmlAfterReload).toContain(latestLabel);
  expect(xmlAfterReload).not.toContain(staleLabel);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const probe = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { registryCount: -1, svgRect: "0x0" };
    const registry = modeler.get("elementRegistry");
    const svg = modeler.get("canvas")?._container?.querySelector?.("svg");
    const rect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
    return {
      registryCount: Array.isArray(registry?.getAll?.()) ? registry.getAll().length : 0,
      svgRect: `${Math.round(Number(rect.width || 0))}x${Math.round(Number(rect.height || 0))}`,
    };
  });
  expect(Number(probe.registryCount || 0)).toBeGreaterThan(0);
  const dims = String(probe.svgRect || "0x0").match(/^(\d+)x(\d+)$/);
  expect(Number(dims?.[1] || 0)).toBeGreaterThan(0);
  expect(Number(dims?.[2] || 0)).toBeGreaterThan(0);
});
