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
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:userTask id="Task_1" name="Контроль качества" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="160" y="170" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="280" y="145" width="180" height="86" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="560" y="170" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="196" y="188" /><di:waypoint x="280" y="188" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="460" y="188" /><di:waypoint x="560" y="188" /></bpmndi:BPMNEdge>
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
    data: { title: `E2E notes tldr ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E notes tldr session ${runId}`,
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

test("notes TL;DR: generates summary and stores it separately from original note", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);
  const sid = fixture.sessionId;

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_leftpanel_hidden", "0");
  });
  await setUiToken(page, auth.accessToken);
  await page.goto("/app");
  await openFixture(page, fixture);
  await switchTab(page, "Diagram");

  const selected = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const eventBus = modeler.get("eventBus");
      const target = registry.get("Task_1")
        || (registry.filter((el) => String(el?.type || "").endsWith("Task")) || [])[0];
      if (!target) return { ok: false, error: "task_missing" };
      eventBus.fire("element.click", { element: target });
      return { ok: true, id: String(target.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(selected.ok, JSON.stringify(selected)).toBeTruthy();
  await expect(page.locator("#element-notes-section")).toBeVisible();

  const inputText = `Контроль точки ${runId}. Роль: технолог. Проверяем температуру и документируем отклонения.`;
  const notePatch = page.waitForResponse((res) => (
    res.request().method() === "PATCH"
    && responsePath(res.url()) === `/api/sessions/${sid}`
    && res.status() === 200
  ));
  await page.fill('textarea[placeholder="Заметка для выбранного узла..."]', inputText);
  await page.getByRole("button", { name: "Добавить заметку к узлу" }).click();
  await notePatch;
  await expect(page.locator("#element-notes-section")).toContainText(inputText);

  const summaryPatch = page.waitForResponse((res) => (
    res.request().method() === "PATCH"
    && responsePath(res.url()) === `/api/sessions/${sid}`
    && res.status() === 200
    && String(res.request().postData() || "").includes("\"summary\"")
  ));
  await page.getByTestId("notes-tldr-generate").click();
  const patchRes = await summaryPatch;
  const payload = patchRes.request().postDataJSON?.() || {};
  const entry = payload?.notes_by_element?.Task_1 || payload?.notes_by_element?.[selected.id] || {};
  const summary = String(entry?.summary || "");
  expect(summary).toContain("TL;DR");
  await expect(page.getByTestId("notes-tldr-summary")).toContainText("TL;DR");
  await expect(page.locator("#element-notes-section")).toContainText(inputText);
});
