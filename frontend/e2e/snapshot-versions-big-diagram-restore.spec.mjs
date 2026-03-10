import { expect, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedBpmnXml(processName = "E2E snapshot versions") {
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
    <bpmn:startEvent id="StartEvent_1" name="Старт" />
    <bpmn:task id="Activity_1" name="Базовый шаг" />
    <bpmn:endEvent id="EndEvent_1" name="Финиш" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="90" y="50" width="1280" height="340" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="290" y="148" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="540" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="216" y="188" /><di:waypoint x="290" y="188" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="430" y="188" /><di:waypoint x="540" y="188" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
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

async function createFixture(request, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E snapshot versions ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E snapshot session ${runId}`,
        roles: ["Линия A", "Линия B"],
        start_role: "Линия A",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: seedBpmnXml(`Seed ${runId}`) },
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

async function readXml(page) {
  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  return await xmlArea.inputValue();
}

async function saveDiagram(page) {
  const saveBtn = page.locator("button.processSaveBtn").first();
  await expect(saveBtn).toBeVisible();
  await saveBtn.click();
}

function countTasks(xmlText) {
  return (
    String(xmlText || "").match(
      /<(?:\w+:)?(?:task|userTask|serviceTask|sendTask|receiveTask|manualTask|scriptTask|businessRuleTask)\b/g,
    ) || []
  ).length;
}

test("big diagram snapshot can be restored from versions list after reload", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const keepLabel = `BIG_KEEP_${runId.slice(-5)}`;
  const rollbackLabel = `ROLLBACK_${runId.slice(-5)}`;
  const fixture = await createFixture(request, runId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_snapshots", "1");
  });

  await openFixture(page, fixture);
  await waitForModelerReady(page);

  const bigMutate = await page.evaluate(({ label }) => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };

    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const canvas = modeler.get("canvas");

      let prev = registry.get("Activity_1");
      if (!prev) return { ok: false, error: "seed_task_missing" };
      const root = prev.parent || canvas.getRootElement();
      if (!root) return { ok: false, error: "root_missing" };

      const createdIds = [];
      for (let i = 1; i <= 14; i += 1) {
        const next = modeling.createShape(
          elementFactory.createShape({ type: "bpmn:Task" }),
          { x: Number(prev.x || 0) + 190, y: Number(prev.y || 0) + (i % 2 === 0 ? 90 : 0) },
          root,
        );
        const nextLabel = i === 1 ? label : `${label}_S${String(i).padStart(2, "0")}`;
        modeling.updateLabel(next, nextLabel);
        modeling.connect(prev, next, { type: "bpmn:SequenceFlow" });
        createdIds.push(String(next.id || ""));
        prev = next;
      }

      return { ok: true, firstNewId: createdIds[0] || "", createdCount: createdIds.length };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { label: keepLabel });
  expect(bigMutate.ok, JSON.stringify(bigMutate)).toBeTruthy();
  expect(Number(bigMutate.createdCount || 0)).toBeGreaterThanOrEqual(10);

  await saveDiagram(page);
  await expect
    .poll(async () => {
      const xml = await readXml(page);
      return xml.includes(keepLabel) && countTasks(xml) >= 10;
    })
    .toBeTruthy();

  await switchTab(page, "Diagram");
  await waitForModelerReady(page);

  const rewrite = await page.evaluate(({ id, rollback }) => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };

    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const target = registry.get(String(id || ""));
      if (!target) return { ok: false, error: "target_missing" };
      modeling.updateLabel(target, rollback);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { id: bigMutate.firstNewId, rollback: rollbackLabel });
  expect(rewrite.ok, JSON.stringify(rewrite)).toBeTruthy();

  await saveDiagram(page);
  await expect
    .poll(async () => {
      const xml = await readXml(page);
      return xml.includes(rollbackLabel);
    })
    .toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await openFixture(page, fixture, { skipGoto: true });
  await waitForModelerReady(page);

  await page.getByTestId("bpmn-versions-open").click();
  await expect(page.getByTestId("bpmn-versions-modal")).toBeVisible();

  const cards = page.getByTestId("bpmn-version-item");
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThanOrEqual(2);

  let restored = false;
  for (let i = 0; i < cardCount; i += 1) {
    const card = cards.nth(i);
    await card.getByTestId("bpmn-version-preview").click();
    const previewXml = await page.getByTestId("bpmn-version-preview-xml").inputValue();
    if (!previewXml.includes(keepLabel) || previewXml.includes(rollbackLabel)) continue;
    await card.getByTestId("bpmn-version-restore").click();
    restored = true;
    break;
  }
  expect(restored).toBeTruthy();
  await expect(page.getByText(/Версия восстановлена/i)).toBeVisible();
  await page.getByRole("button", { name: "Закрыть" }).click();

  await expect
    .poll(async () => {
      const xml = await readXml(page);
      return xml.includes(keepLabel) && !xml.includes(rollbackLabel);
    })
    .toBeTruthy();
});
