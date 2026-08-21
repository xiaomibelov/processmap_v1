import { expect, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedBpmnXml(name = "E2E AI loading panel") {
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
    <bpmn:task id="Activity_1" name="AI loading task" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="270" y="128" width="150" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="500" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
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
    data: { title: `E2E AI loading project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E AI loading session ${runId}`,
        roles: ["Повар 1", "Повар 2"],
        start_role: "Повар 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: seedBpmnXml(`E2E AI loading ${runId}`) },
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
}

test("AI в Interview открывает панель сразу и показывает loading", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createFixture(request, runId);

  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_debug_ai", "1");
  });

  await page.route(/\/api\/sessions\/[^/]+\/ai\/questions$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llm_step: {
          status: "processed",
          node_id: "Activity_1",
          node_title: "AI loading task",
          generated: 1,
          remaining: 0,
          processed: 1,
          total: 1,
        },
        questions: [
          {
            id: "llm_q_loading_1",
            node_id: "Activity_1",
            question: "Какая контрольная точка перед завершением шага?",
            status: "open",
          },
        ],
      }),
    });
  });

  await openFixture(page, fixture);
  await switchTab(page, "Interview");

  const aiBtn = page.locator(".interviewRowActions .secondaryBtn").filter({ hasText: /^AI$/i }).first();
  await expect(aiBtn).toBeVisible({ timeout: 15_000 });

  await aiBtn.click();
  await expect(page.locator(".interviewAiCue")).toBeVisible({ timeout: 1_500 });
  await expect(page.locator(".interviewAiRunStatus")).toContainText(/Генерирую вопросы|Открываю окно вопросов/i);
  await expect(page.locator(".interviewAiSkeleton")).toBeVisible();

  await expect(page.locator(".interviewAiCueList")).toContainText("Какая контрольная точка перед завершением шага?", { timeout: 15_000 });
  await expect(page.locator(".interviewAiRunStatus")).toContainText("Готово");
});

