import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const APP_BASE = process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177";

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
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Проверить партию">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="170" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="290" y="148" width="170" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="560" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="206" y="188" />
        <di:waypoint x="290" y="188" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="460" y="188" />
        <di:waypoint x="560" y="188" />
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
    data: { title: `E2E agent stream ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project?.id || project?.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E agent stream session ${runId}`,
        roles: ["Контроль качества"],
        start_role: "Контроль качества",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session?.id || session?.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const getRes = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, { headers });
  const sessionBody = await apiJson(getRes, "get session version");
  const baseVersion = Number(sessionBody?.diagram_state_version ?? sessionBody?.version ?? 0);

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers,
    data: { xml: seedXml(), base_diagram_state_version: baseVersion },
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
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await expect(page.getByTestId("diagram-action-processman")).toBeVisible({ timeout: 20_000 });
}

async function routerUsageBefore(request, headers) {
  const res = await request.get(`${API_BASE}/api/admin/llm/usage?feature=agent_router`, { headers });
  const body = await apiJson(res, "router usage baseline");
  return Number(body?.totals?.prompt_tokens || 0);
}

async function routerUsageAfter(request, headers) {
  const res = await request.get(`${API_BASE}/api/admin/llm/usage?feature=agent_router`, { headers });
  const body = await apiJson(res, "router usage after");
  return Number(body?.totals?.prompt_tokens || 0);
}

test("PROCESSMAN свободный вопрос через /agent/stream доходит с реальным текстом", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_ai", "1");
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  await openFixture(page, fixture);

  // Открыть панель PROCESSMAN.
  const processmanBtn = page.getByTestId("diagram-action-processman");
  await expect(processmanBtn).toBeVisible();
  await processmanBtn.click();
  await expect(page.getByTestId("processman-panel")).toBeVisible();

  // Выбрать шаг на диаграмме.
  const taskShape = page.locator('.djs-element[data-element-id="Task_1"]').first();
  await expect(taskShape).toBeVisible();
  await taskShape.click();

  // Базовый расход роутера до запроса.
  const baselineTokens = await routerUsageBefore(request, auth.headers);

  const question = "что делает этот шаг?";
  await page.getByTestId("processman-qa-input").fill(question);
  await page.getByTestId("processman-action-qa").click();

  // Дождаться финального ответа (не ошибки) с непустым текстом.
  await expect
    .poll(
      async () => {
        const text = await page.getByTestId("processman-answer-text").textContent().catch(() => "");
        const errorVisible = await page.getByTestId("processman-answer-error").isVisible().catch(() => false);
        return { text: String(text || "").trim(), errorVisible };
      },
      {
        message: "ожидали осмысленный ответ в панели",
        timeout: 60_000,
        intervals: [500, 500, 1000],
      },
    )
    .toEqual(expect.objectContaining({ errorVisible: false }));

  const finalText = await page.getByTestId("processman-answer-text").textContent();
  expect(String(finalText || "").trim().length).toBeGreaterThan(5);

  // В llm_usage виден реальный текст вопроса: prompt_tokens роутера вырос.
  const afterTokens = await routerUsageAfter(request, auth.headers);
  expect(afterTokens).toBeGreaterThan(baselineTokens);

  // eslint-disable-next-line no-console
  console.log(`[AGENT_STREAM_E2E] baseline=${baselineTokens} after=${afterTokens} text_len=${String(finalText).trim().length}`);
});
