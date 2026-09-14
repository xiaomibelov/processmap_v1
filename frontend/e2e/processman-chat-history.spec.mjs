// agent-ui-completion-v1 — e2e гейта G1: история чата PROCESSMAN переживает reload.
// Отправка вопроса идёт на РЕАЛЬНЫЙ бэкенд (LLM-ключ локального стека): turn'ы
// сохраняются в agent_turns даже при LLM-ошибке (chat.py пишет user-turn до вызова).
// Гидрация после reload — реальный GET /agent/history (никаких сетевых моков).
// Скрины: S1 — отправленный вопрос, S2 — история после reload.
import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

test.describe.configure({ retries: 1 });

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

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
    data: { title: `E2E chat history ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project?.id || project?.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: { title: `E2E chat history session ${runId}`, roles: ["Контроль качества"], start_role: "Контроль качества" },
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

const QUESTION = "Что можно улучшить в этом шаге?";

async function setupFixture(page, request) {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  page.on("pageerror", (err) => console.log("PAGEERROR:", String(err?.message || err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
  });
  return { auth, fixture };
}

async function openSessionAndPanel(page, fixture) {
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");

  const orgHeading = page.locator("h1:has-text('Выберите организацию')");
  try {
    await orgHeading.waitFor({ state: "visible", timeout: 5000 });
    const defaultOrg = page.getByRole("button", { name: /Default/ }).first();
    if (await defaultOrg.count() > 0) await defaultOrg.click();
    else await page.getByRole("button").first().click();
    await page.waitForTimeout(500);
  } catch {
    // org-гейт не показан — продолжаем
  }

  await expect(page.getByTestId("diagram-action-processman")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("diagram-action-processman").click();
  await expect(page.getByTestId("processman-panel")).toBeVisible();
  const taskShape = page.locator('.djs-element[data-element-id="Task_1"]').first();
  await page.getByText("Загрузка диаграммы…").first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  await expect(taskShape).toBeVisible({ timeout: 30_000 });
}

test("G1: история чата видна после reload (гидрация GET /agent/history)", async ({ page, request }) => {
  const { fixture } = await setupFixture(page, request);
  const historyRequests = [];
  page.on("request", (req) => {
    if (/\/agent\/history/.test(req.url())) historyRequests.push(req);
  });

  await openSessionAndPanel(page, fixture);
  await page.locator('.djs-element[data-element-id="Task_1"]').first().click();

  const input = page.getByTestId("processman-qa-input");
  await input.fill(QUESTION);
  await input.press("Enter");

  // user-сообщение появляется сразу (оптимистичная лента); ответ/ошибка — после стрима
  await expect(page.getByTestId("processman-tobe")).toContainText(QUESTION, { timeout: 20_000 });
  // дожидаемся финала стрима (ok или честный error — оба валидны для G1)
  await expect(
    page.getByTestId("processman-tobe").locator('[data-testid="processman-answer-ok"], [data-testid="processman-answer-error"]'),
  ).toBeVisible({ timeout: 120_000 });
  await page.screenshot({ path: "e2e-artifacts/g1-chat-history-s1-sent.png", fullPage: true });

  // G4 (часть): гидрация до отправки = ровно один GET /agent/history
  expect(historyRequests.length).toBe(1);

  // reload → лента пустая in-memory → гидрация из БД
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await openSessionAndPanel(page, fixture);

  // история видна без отправки нового сообщения
  await expect(page.getByTestId("processman-tobe")).toContainText(QUESTION, { timeout: 30_000 });
  const feed = page.getByTestId("processman-tobe");
  const agentMsgCount = await feed.locator(".pm-processman-msg--agent, [data-testid^='processman-answer-']").count();
  expect(agentMsgCount).toBeGreaterThan(0);
  await page.screenshot({ path: "e2e-artifacts/g1-chat-history-s2-after-reload.png", fullPage: true });

  // после reload гидрация снова = ровно один GET (второй за тест)
  expect(historyRequests.length).toBe(2);
});
