import { expect, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedBpmnXml(name = "E2E AI attach") {
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
    <bpmn:task id="Activity_1" name="AI attach task" />
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
    data: { title: `E2E AI attach project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E AI attach session ${runId}`,
        roles: ["Повар 1", "Повар 2"],
        start_role: "Повар 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: seedBpmnXml(`E2E AI attach ${runId}`) },
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
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

async function selectTaskOnDiagram(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const eventBus = modeler.get("eventBus");
      const target = registry.get("Activity_1")
        || (registry.filter((el) => String(el?.type || "").endsWith("Task")) || [])[0];
      if (!target) return { ok: false, error: "task_missing" };
      eventBus.fire("element.click", { element: target });
      return {
        ok: true,
        id: String(target.id || ""),
        name: String(target.businessObject?.name || target.id || ""),
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
}

test("AI-вопросы привязываются к выбранному узлу и показывают badge/панель без изменения BPMN XML", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createFixture(request, runId);
  const questionText = "Как подтверждается критическая точка качества?";

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_ai", "1");
    window.localStorage.setItem("fpc_leftpanel_hidden", "0");
  });

  await page.route(/\/api\/sessions\/[^/]+\/ai\/questions$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llm_step: {
          status: "processed",
          node_id: "Activity_1",
          node_title: "AI attach task",
          generated: 1,
          remaining: 0,
          processed: 1,
          total: 1,
        },
        questions: [
          {
            id: "llm_q_attach_1",
            node_id: "Activity_1",
            question: questionText,
            status: "open",
          },
        ],
      }),
    });
  });

  await openFixture(page, fixture);
  await expect
    .poll(async () => await page.evaluate(() => !!window.__FPC_E2E_MODELER__))
    .toBeTruthy();

  const selected = await selectTaskOnDiagram(page);
  expect(selected.ok, JSON.stringify(selected)).toBeTruthy();

  await switchTab(page, "Interview");
  const aiBtn = page.locator(".interviewRowActions .secondaryBtn").filter({ hasText: /^AI$/i }).first();
  await expect(aiBtn).toBeVisible({ timeout: 15_000 });
  await aiBtn.click();

  await expect(page.locator(".interviewAiCueList")).toContainText(questionText, { timeout: 15_000 });
  const firstAiCheckbox = page.locator(".interviewAiCueList .interviewAiCueItem input[type='checkbox']").first();
  await expect(firstAiCheckbox).toBeVisible();
  await firstAiCheckbox.check();
  await page.getByRole("button", { name: "Добавить к элементу" }).click();
  await expect(page.locator(".interviewAiNoteStatus.ok")).toContainText("Добавлено к элементу", { timeout: 10_000 });

  await switchTab(page, "Diagram");
  await expect
    .poll(async () => {
      return await page.evaluate(() => document.querySelectorAll(".fpcAiQuestionIndicator").length);
    })
    .toBeGreaterThan(0);

  await page.evaluate(() => {
    const btn = document.querySelector(".fpcAiQuestionIndicator");
    if (btn instanceof HTMLElement) btn.click();
  });
  await expect(page.locator(".fpcAiQuestionPanel")).toBeVisible();
  await expect(page.locator("#element-notes-section")).toContainText(questionText);

  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  const xml = await xmlArea.inputValue();
  expect(xml.toLowerCase()).not.toContain(questionText.toLowerCase());
});
