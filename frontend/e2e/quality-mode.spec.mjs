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

function seedXmlWithoutEndAndLabel() {
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
    <bpmn:task id="Task_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="300" y="148" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="216" y="188" />
        <di:waypoint x="300" y="188" />
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
    data: { title: `E2E quality mode ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E quality mode session ${runId}`,
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
    data: { xml: seedXmlWithoutEndAndLabel() },
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

async function readVersionsCount(page) {
  const text = String(await page.getByTestId("bpmn-versions-count").innerText());
  const match = text.match(/Последние версии:\s*(\d+)/i);
  return Number(match?.[1] || 0);
}

test("quality mode: profiles + autofix + snapshot checkpoint", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);
  const sid = fixture.sessionId;

  let persistOkCount = 0;
  page.on("response", (res) => {
    if (
      res.request().method() === "PUT"
      && responsePath(res.url()) === `/api/sessions/${sid}/bpmn`
      && res.status() === 200
    ) {
      persistOkCount += 1;
    }
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_snapshots", "1");
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await setUiToken(page, auth.accessToken);
  await page.goto("/app");
  await openFixture(page, fixture);
  await switchTab(page, "Diagram");

  await page.getByTestId("bpmn-versions-open").click();
  await expect(page.getByTestId("bpmn-versions-modal")).toBeVisible();
  const beforeCount = await readVersionsCount(page);
  await page.getByRole("button", { name: "Закрыть" }).click();

  await page.getByTestId("diagram-quality-toggle").click();
  const panel = page.getByTestId("quality-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/отсутствует endevent/i);

  await page.getByTestId("quality-profile-select").selectOption("production");
  await expect(page.getByTestId("quality-profile-select")).toHaveValue("production");

  const persistBeforeFix = persistOkCount;
  await page.getByTestId("quality-autofix-open").click();
  await expect(page.getByTestId("quality-autofix-modal")).toBeVisible();
  await page.getByTestId("quality-autofix-apply").click();

  await expect.poll(() => persistOkCount).toBeGreaterThan(persistBeforeFix);
  await expect
    .poll(async () => await page.getByTestId("quality-panel").innerText())
    .not.toMatch(/отсутствует endevent/i);

  await page.getByTestId("bpmn-versions-open").click();
  await expect(page.getByTestId("bpmn-versions-modal")).toBeVisible();
  const afterCount = await readVersionsCount(page);
  expect(afterCount).toBeGreaterThanOrEqual(beforeCount + 1);
  await expect(page.getByTestId("bpmn-versions-modal")).toContainText(/Auto-fix/i);
});
