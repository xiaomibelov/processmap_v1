import { expect, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function seedWithPoolAndLanesXml(processName = "Manual snapshots seed") {
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
      <bpmn:lane id="Lane_A" name="Линия A">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_B" name="Линия B">
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_1" name="Базовый шаг">
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
        <dc:Bounds x="80" y="40" width="1450" height="420" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_A_di" bpmnElement="Lane_A" isHorizontal="true">
        <dc:Bounds x="110" y="40" width="1420" height="210" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_B_di" bpmnElement="Lane_B" isHorizontal="true">
        <dc:Bounds x="110" y="250" width="1420" height="210" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="170" y="130" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="280" y="108" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="580" y="322" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="206" y="148" /><di:waypoint x="280" y="148" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="420" y="148" /><di:waypoint x="510" y="148" /><di:waypoint x="510" y="340" /><di:waypoint x="580" y="340" />
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

async function createFixture(request, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E manual snapshots ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E manual snapshots session ${runId}`,
        roles: ["Линия A", "Линия B"],
        start_role: "Линия A",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: seedWithPoolAndLanesXml(`Seed ${runId}`) },
  });
  await apiJson(putRes, "seed bpmn");

  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openFixture(page, fixture, options = {}) {
  if (!options?.skipGoto) await page.goto("/");
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
        const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        const all = registry?.getAll?.() || [];
        return all.length > 0;
      });
    })
    .toBeTruthy();
}

async function saveAndWaitPersist(page) {
  const responsePromise = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && /\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())
      && resp.status() === 200;
  });
  await page.locator("button.processSaveBtn").first().click();
  await responsePromise;
}

async function openVersionsModal(page) {
  const trigger = page.getByTestId("bpmn-versions-open");
  await expect(trigger).toBeVisible();
  await trigger.evaluate((node) => node.click());
  await expect(page.getByTestId("bpmn-versions-modal")).toBeVisible();
}

async function closeVersionsModal(page) {
  await page.getByRole("button", { name: "Закрыть" }).click();
}

async function createManualSnapshotFromModal(page) {
  await page.getByRole("button", { name: "Создать версию" }).click();
}

test("manual snapshots accumulate with BPMN changes and keep clear signal for pan/zoom", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createFixture(request, runId);

  const putPayloads = [];
  const persistOkLogs = [];
  const snapshotDecisionLogs = [];
  const snapshotSavedLogs = [];
  const uiVersionLogs = [];
  const uiSnapshotLogs = [];

  page.on("request", (req) => {
    if (req.method() !== "PUT") return;
    if (!/\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(req.url())) return;
    let xml = "";
    try {
      const body = req.postDataJSON?.();
      xml = String(body?.xml || "");
    } catch {
      xml = "";
    }
    putPayloads.push({
      hash: fnv1aHex(xml),
      len: xml.length,
    });
  });

  page.on("console", (msg) => {
    const text = String(msg.text() || "");
    if (text.includes("PERSIST_OK")) persistOkLogs.push(text);
    if (text.includes("SNAPSHOT_DECISION")) snapshotDecisionLogs.push(text);
    if (text.includes("SNAPSHOT_SAVED")) snapshotSavedLogs.push(text);
    if (text.includes("UI_VERSIONS_LOAD")) uiVersionLogs.push(text);
    if (text.includes("UI_SNAPSHOT_CLICK") || text.includes("UI_SNAPSHOT_RESULT")) uiSnapshotLogs.push(text);
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_snapshots", "1");
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_tabs", "1");
    window.localStorage.setItem("fpc_debug_trace", "1");
  });

  await openFixture(page, fixture);
  await waitForModelerReady(page);

  const names = {
    a: `MANUAL_A_${runId.slice(-4)}`,
    b: `MANUAL_B_${runId.slice(-4)}`,
    bRenamed: `MANUAL_B_RENAMED_${runId.slice(-4)}`,
  };

  const step1 = await page.evaluate(({ label }) => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const baseTask = registry.get("Activity_1");
      if (!baseTask) return { ok: false, error: "base_task_missing" };
      const root = baseTask.parent;
      const taskA = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(baseTask.x || 0) + 220, y: Number(baseTask.y || 0) },
        root,
      );
      modeling.updateLabel(taskA, label);
      modeling.connect(baseTask, taskA, { type: "bpmn:SequenceFlow" });
      return { ok: true, taskAId: String(taskA.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { label: names.a });
  expect(step1.ok, JSON.stringify(step1)).toBeTruthy();
  await saveAndWaitPersist(page);
  await openVersionsModal(page);
  await createManualSnapshotFromModal(page);
  await closeVersionsModal(page);

  const step2 = await page.evaluate(({ fromId, label }) => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const fromTask = registry.get(String(fromId || ""));
      if (!fromTask) return { ok: false, error: "from_task_missing" };
      const root = fromTask.parent;
      const taskB = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(fromTask.x || 0) + 220, y: Number(fromTask.y || 0) + 120 },
        root,
      );
      modeling.updateLabel(taskB, label);
      modeling.connect(fromTask, taskB, { type: "bpmn:SequenceFlow" });
      return { ok: true, taskBId: String(taskB.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { fromId: step1.taskAId, label: names.b });
  expect(step2.ok, JSON.stringify(step2)).toBeTruthy();
  await saveAndWaitPersist(page);
  await openVersionsModal(page);
  await createManualSnapshotFromModal(page);
  await closeVersionsModal(page);

  const step3 = await page.evaluate(({ taskBId, renamed }) => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const taskB = registry.get(String(taskBId || ""));
      if (!taskB) return { ok: false, error: "taskB_missing" };
      modeling.updateLabel(taskB, renamed);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { taskBId: step2.taskBId, renamed: names.bRenamed });
  expect(step3.ok, JSON.stringify(step3)).toBeTruthy();
  await saveAndWaitPersist(page);
  await openVersionsModal(page);
  await createManualSnapshotFromModal(page);

  const versions = page.getByTestId("bpmn-version-item");
  const versionsCountAfterChanges = await versions.count();
  expect(versionsCountAfterChanges).toBeGreaterThanOrEqual(3);

  const beforePanZoomCount = versionsCountAfterChanges;
  await closeVersionsModal(page);
  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return false;
    const canvas = modeler.get("canvas");
    canvas.zoom(1.15);
    canvas.scroll({ dx: 120, dy: 45 });
    canvas.zoom(0.95);
    return true;
  });

  await openVersionsModal(page);
  await createManualSnapshotFromModal(page);
  const versionsCountAfterPanZoom = await page.getByTestId("bpmn-version-item").count();
  expect(versionsCountAfterPanZoom).toBeGreaterThanOrEqual(beforePanZoomCount);

  await closeVersionsModal(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await openFixture(page, fixture, { skipGoto: true });
  await waitForModelerReady(page);
  await openVersionsModal(page);
  expect(await page.getByTestId("bpmn-version-item").count()).toBeGreaterThanOrEqual(3);

  await expect.poll(() => persistOkLogs.length).toBeGreaterThanOrEqual(3);
  await expect.poll(() => snapshotSavedLogs.length).toBeGreaterThanOrEqual(3);
  await expect.poll(() => uiVersionLogs.length).toBeGreaterThanOrEqual(1);
  await expect.poll(() => uiSnapshotLogs.length).toBeGreaterThanOrEqual(3);

  const persistedDistinct = new Set(putPayloads.map((it) => `${it.hash}:${it.len}`));
  expect(persistedDistinct.size).toBeGreaterThanOrEqual(3);

  persistOkLogs.slice(-4).forEach((line) => console.log(line));
  snapshotDecisionLogs.slice(-6).forEach((line) => console.log(line));
  snapshotSavedLogs.slice(-4).forEach((line) => console.log(line));
  uiVersionLogs.slice(-3).forEach((line) => console.log(line));
  uiSnapshotLogs.slice(-6).forEach((line) => console.log(line));
  Array.from(persistedDistinct).forEach((entry) => console.log(`PUT_BPMN_DISTINCT ${entry}`));
  putPayloads.slice(-6).forEach((it) => console.log(`PUT_BPMN hash=${it.hash} len=${it.len}`));
});
