// AGENT-3 — e2e панели pending edits: approve / reject / conflict_rev / unsupported.
// Детерминизм: propose приходит из сетевого мока SSE /agent/stream, решения —
// из мока /agent/resume (реальный бэкенд propose требует LLM и недетерминирован).
// Фикстура сессии — на реальном локальном стеке (как в agent-stream-field-contract).
import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

// Ретрай — только против инфра-флейков (холодный запуск vite/стека на CI).
// Продуктовая логика каждого сценария детерминирована (сетевые моки).
test.describe.configure({ retries: 2 });

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
    data: { title: `E2E pending edits ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project?.id || project?.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: { title: `E2E pending edits session ${runId}`, roles: ["Контроль качества"], start_role: "Контроль качества" },
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

function sseBody(events) {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
}

const SSE_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache" };

function renameProposeSse() {
  return sseBody([
    { event: "start", data: { turn_id: "turn_e2e" } },
    {
      event: "confirm_required",
      data: {
        pending_edit_id: "pe_e2e_1",
        edit_plan: {
          note: "уточнить название шага",
          operations: [{ op: "update_node", node_id: "Task_1", fields: { title: "Проверка партии сырья" } }],
        },
        diff: [{ op: "update", node_id: "Task_1", field: "title", new_value: "Проверка партии сырья" }],
        timeout_sec: 900,
      },
    },
    { event: "done", data: { usage: {} } },
  ]);
}

async function mockPropose(page, body = renameProposeSse()) {
  await page.route("**/api/sessions/*/agent/stream", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({ status: 200, headers: SSE_HEADERS, body });
  });
}

async function setupFixture(page, request) {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_ai", "1");
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  return { auth, fixture };
}

async function openPanelWithPropose(page, fixture) {
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");

  // Multi-org gate: выбрать дефолтную организацию, если показан выбор.
  const orgHeading = page.locator("h1:has-text('Выберите организацию')");
  try {
    await orgHeading.waitFor({ state: "visible", timeout: 5000 });
    const defaultOrg = page.getByRole("button", { name: /Default/ }).first();
    if (await defaultOrg.count() > 0) {
      await defaultOrg.click();
    } else {
      await page.getByRole("button").first().click();
    }
    await page.waitForTimeout(500);
  } catch {
    // org-гейт не показан — продолжаем
  }

  await expect(page.getByTestId("diagram-action-processman")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("diagram-action-processman").click();
  await expect(page.getByTestId("processman-panel")).toBeVisible();
  const taskShape = page.locator('.djs-element[data-element-id="Task_1"]').first();
  // Флейк-защита: дождаться полной загрузки канваса до клика по шейпу.
  await page.getByText("Загрузка диаграммы…").first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  await expect(taskShape).toBeVisible({ timeout: 30_000 });
  await taskShape.click();
  const input = page.getByTestId("processman-qa-input");
  await input.fill("переименуй этот шаг");
  await input.press("Enter");
  await expect(page.getByTestId("processman-edit-card")).toBeVisible({ timeout: 20_000 });
}

test("pending edits: панель показывает structured diff, «Применить» → applied", async ({ page, request }) => {
  const { fixture } = await setupFixture(page, request);
  await mockPropose(page);
  let resumeDecision = "";
  await page.route("**/api/sessions/*/agent/resume", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    resumeDecision = String(route.request().postDataJSON()?.decision || "");
    return route.fulfill({
      status: 200,
      headers: SSE_HEADERS,
      body: sseBody([
        { event: "start", data: { turn_id: "turn_resume" } },
        { event: "done", data: { status: "applied", operations_applied: 1 } },
      ]),
    });
  });

  await openPanelWithPropose(page, fixture);

  const card = page.getByTestId("processman-edit-card");
  await expect(card).toContainText("уточнить название шага");
  // В quick_skeleton-фикстуре draft.nodes пуст (projection появляется после анализа):
  // элемент показан по BPMN id; резолв имён покрыт component-тестами.
  await expect(page.getByTestId("processman-edit-op-row")).toContainText("Task_1");
  await expect(page.getByTestId("processman-edit-op-row")).toContainText("Название");
  await expect(page.getByTestId("processman-edit-op-row")).toContainText("Проверка партии сырья");
  await expect(page.getByTestId("processman-edit-timer")).toBeVisible();

  await page.getByTestId("processman-edit-confirm").click();
  await expect(page.getByTestId("processman-edit-status")).toContainText("Правка применена", { timeout: 20_000 });
  await expect(page.getByTestId("processman-edit-confirm")).toHaveCount(0);
  expect(resumeDecision).toBe("confirm");
});

test("pending edits: «Отклонить» идёт на бэкенд (decision=reject) → rejected", async ({ page, request }) => {
  const { fixture } = await setupFixture(page, request);
  await mockPropose(page);
  let resumeDecision = "";
  await page.route("**/api/sessions/*/agent/resume", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    resumeDecision = String(route.request().postDataJSON()?.decision || "");
    return route.fulfill({
      status: 200,
      headers: SSE_HEADERS,
      body: sseBody([
        { event: "start", data: { turn_id: "turn_resume" } },
        { event: "done", data: { status: "rejected" } },
      ]),
    });
  });

  await openPanelWithPropose(page, fixture);
  await page.getByTestId("processman-edit-reject").click();
  await expect(page.getByTestId("processman-edit-status")).toContainText("Правка отклонена", { timeout: 20_000 });
  expect(resumeDecision).toBe("reject");
});

test("pending edits: conflict_rev показывает версии диаграммы", async ({ page, request }) => {
  const { fixture } = await setupFixture(page, request);
  await mockPropose(page);
  await page.route("**/api/sessions/*/agent/resume", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 200,
      headers: SSE_HEADERS,
      body: sseBody([
        { event: "start", data: { turn_id: "turn_resume" } },
        {
          event: "error",
          data: {
            status: "conflict_rev",
            error: "diagram state version conflict",
            details: { pending_base_version: 1, server_current_version: 2 },
          },
        },
      ]),
    });
  });

  await openPanelWithPropose(page, fixture);
  await page.getByTestId("processman-edit-confirm").click();
  const status = page.getByTestId("processman-edit-status");
  await expect(status).toContainText("изменилась", { timeout: 20_000 });
  await expect(status).toContainText("v1");
  await expect(status).toContainText("v2");
  await expect(page.getByTestId("processman-edit-confirm")).toHaveCount(0);
});

test("pending edits: неподдержанные операции — баннер, без кнопки «Применить»", async ({ page, request }) => {
  const { fixture } = await setupFixture(page, request);
  await mockPropose(page, sseBody([
    { event: "start", data: { turn_id: "turn_e2e" } },
    {
      event: "confirm_required",
      data: {
        pending_edit_id: "pe_e2e_2",
        edit_plan: { note: "", operations: [{ op: "add_node", node_id: "Task_9", title: "Новый шаг" }] },
        diff: [{ op: "add_node", node_id: "Task_9", title: "Новый шаг" }],
        timeout_sec: 900,
      },
    },
    { event: "done", data: { usage: {} } },
  ]));

  await openPanelWithPropose(page, fixture);
  await expect(page.getByTestId("processman-edit-unsupported")).toBeVisible();
  await expect(page.getByTestId("processman-edit-confirm")).toHaveCount(0);
  await expect(page.getByTestId("processman-edit-reject")).toBeVisible();
});
