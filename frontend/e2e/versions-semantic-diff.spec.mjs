import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { fnv1aHex } from "./helpers/bpmnFixtures.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedBpmnXml(processName = "Versions semantic diff seed") {
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
        <bpmn:flowNodeRef>Task_A</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_B</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_A" name="Подготовка">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_B" name="Проверка">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_A" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="Task_B" name="если ок" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_B" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="120" y="80" width="980" height="280" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_A_di" bpmnElement="Lane_A" isHorizontal="true">
        <dc:Bounds x="150" y="80" width="950" height="280" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="200" y="192" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="320" y="170" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="540" y="170" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="760" y="192" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="236" y="210" /><di:waypoint x="320" y="210" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="440" y="210" /><di:waypoint x="540" y="210" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="660" y="210" /><di:waypoint x="760" y="210" />
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

async function createFixture(request, runId, authHeaders) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: { title: `E2E semantic diff ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: authHeaders,
      data: {
        title: `E2E semantic diff session ${runId}`,
        roles: ["Линия A"],
        start_role: "Линия A",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers: authHeaders,
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

async function openFixture(page, fixture, accessToken, options = {}) {
  if (!options?.skipGoto) await page.goto("/app");
  const projectSelect = page.locator(".topbar .topSelect--project");
  const hasWorkspace = await projectSelect.isVisible({ timeout: 3000 }).catch(() => false);
  if (!hasWorkspace) {
    await page.evaluate((token) => {
      window.localStorage.setItem("fpc_auth_access_token", String(token || ""));
    }, accessToken);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await expect(projectSelect).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

async function waitForDiagram(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        return (registry?.getAll?.() || []).length > 0;
      });
    })
    .toBeTruthy();
}

async function saveAndWaitPut(page) {
  const putOk = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && /\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())
      && resp.status() === 200;
  });
  await page.locator("button.processSaveBtn").first().click();
  await putOk;
}

async function openVersionsModal(page) {
  const trigger = page.getByTestId("bpmn-versions-open");
  await expect(trigger).toBeVisible();
  await trigger.evaluate((node) => node.click());
  await expect(page.getByTestId("bpmn-versions-modal")).toBeVisible();
}

async function closeVersionsModal(page) {
  await page.getByRole("button", { name: "Закрыть" }).first().click();
}

test("versions semantic diff shows changed tasks/condition and pinned checkpoint stays on top", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const marker = runId.slice(-5);
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);

  const putPayloads = [];
  page.on("request", (req) => {
    if (req.method() !== "PUT") return;
    if (!/\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(req.url())) return;
    try {
      const body = req.postDataJSON?.() || {};
      const xml = String(body?.xml || "");
      putPayloads.push({ hash: fnv1aHex(xml), len: xml.length });
    } catch {
      putPayloads.push({ hash: "", len: 0 });
    }
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_debug_snapshots", "1");
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_tabs", "1");
    window.localStorage.setItem("fpc_debug_trace", "1");
  });
  await setUiToken(page, auth.accessToken);
  await openFixture(page, fixture, auth.accessToken);
  await waitForDiagram(page);

  await openVersionsModal(page);
  await page.getByRole("button", { name: "Создать версию" }).click();
  await expect(page.getByTestId("bpmn-version-item")).toHaveCount(1);
  await closeVersionsModal(page);

  const mutation = await page.evaluate(({ m }) => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const taskA = registry.get("Task_A");
      const taskB = registry.get("Task_B");
      const flow2 = registry.get("Flow_2");
      if (!taskA || !taskB || !flow2) return { ok: false, error: "seed_elements_missing" };
      modeling.updateLabel(taskA, `Подготовка ${m}`);
      modeling.updateLabel(taskB, `Проверка ${m}`);
      modeling.updateProperties(flow2, { name: `если_риски_${m}` });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { m: marker });
  expect(mutation.ok, JSON.stringify(mutation)).toBeTruthy();
  await saveAndWaitPut(page);

  await openVersionsModal(page);
  await page.getByRole("button", { name: "Создать версию" }).click();
  const cards = page.getByTestId("bpmn-version-item");
  await expect(cards).toHaveCount(2);

  const ids = await page.locator("[data-testid='bpmn-version-item']").evaluateAll((nodes) => {
    return nodes.map((node) => String(node.getAttribute("data-snapshot-id") || "")).filter(Boolean);
  });
  expect(ids.length).toBeGreaterThanOrEqual(2);
  const latestId = String(ids[0] || "");
  const olderId = String(ids[1] || "");
  expect(latestId).not.toBe("");
  expect(olderId).not.toBe("");

  await page.locator(`[data-snapshot-id="${latestId}"] [data-testid="bpmn-version-diff"]`).click();
  await expect(page.getByTestId("bpmn-versions-diff-modal")).toBeVisible();
  await page.getByTestId("bpmn-diff-base-select").selectOption(olderId);
  await page.getByTestId("bpmn-diff-target-select").selectOption(latestId);
  await expect(page.getByTestId("bpmn-diff-count-tasks-changed")).toHaveText("2");
  await expect(page.getByTestId("bpmn-diff-count-conditions-changed")).toHaveText("1");
  await page.getByRole("button", { name: "Закрыть" }).first().click();

  await page.locator(`[data-snapshot-id="${olderId}"] [data-testid="bpmn-version-pin"]`).click();
  await expect(page.locator("[data-testid='bpmn-version-item']").first()).toHaveAttribute("data-snapshot-id", olderId);
  await closeVersionsModal(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await openFixture(page, fixture, auth.accessToken, { skipGoto: true });
  await waitForDiagram(page);
  await openVersionsModal(page);
  await expect(page.locator("[data-testid='bpmn-version-item']").first()).toHaveAttribute("data-snapshot-id", olderId);

  expect(putPayloads.length).toBeGreaterThanOrEqual(1);
});
