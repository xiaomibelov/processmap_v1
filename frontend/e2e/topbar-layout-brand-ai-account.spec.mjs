import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedBpmnXml(name = "E2E TopBar") {
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
    <bpmn:task id="Activity_1" name="Topbar test task" />
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

async function createFixture(request, runId, headers) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { title: `E2E TopBar Project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E TopBar Session ${runId}`,
        roles: ["Технолог"],
        start_role: "Технолог",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers,
    data: { xml: seedBpmnXml(`TopBar layout ${runId}`) },
  });
  await apiJson(putRes, "put bpmn");
  return { projectId, sessionId };
}

async function openFixture(page, fixture) {
  await expect(page.getByTestId("topbar-project-select")).toBeVisible();
  await page.selectOption('[data-testid="topbar-project-select"]', fixture.projectId);
  await expect.poll(async () => {
    return await page.locator(`[data-testid="topbar-session-select"] option[value="${fixture.sessionId}"]`).count();
  }).toBeGreaterThan(0);
  await page.selectOption('[data-testid="topbar-session-select"]', fixture.sessionId);
}

test("topbar layout: brand text + AI button + account menu", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);

  await page.setViewportSize({ width: 1600, height: 920 });
  await setUiToken(page, auth.accessToken);
  await page.goto("/app");
  await openFixture(page, fixture);

  await expect(page.getByTestId("topbar-brand-text")).toHaveText("ProcessMap");
  await expect(page.locator(".topbar img")).toHaveCount(0);
  await expect(page.locator('[data-testid="topbar-logo"]')).toHaveCount(0);

  const newProjectBtn = page.getByTestId("topbar-new-project");
  const newSessionBtn = page.getByTestId("topbar-new-session");
  const projectSelect = page.getByTestId("topbar-project-select");
  const sessionSelect = page.getByTestId("topbar-session-select");

  await expect(newProjectBtn).toBeVisible();
  await expect(newSessionBtn).toBeVisible();
  await expect(projectSelect).toBeVisible();
  await expect(sessionSelect).toBeVisible();

  const [newProjectBox, newSessionBox, projectSelectBox, sessionSelectBox] = await Promise.all([
    newProjectBtn.boundingBox(),
    newSessionBtn.boundingBox(),
    projectSelect.boundingBox(),
    sessionSelect.boundingBox(),
  ]);

  expect(newProjectBox).not.toBeNull();
  expect(newSessionBox).not.toBeNull();
  expect(projectSelectBox).not.toBeNull();
  expect(sessionSelectBox).not.toBeNull();
  expect(newProjectBox.x).toBeLessThan(projectSelectBox.x);
  expect(newSessionBox.x).toBeLessThan(projectSelectBox.x);
  expect(newProjectBox.x).toBeLessThan(sessionSelectBox.x);
  expect(newSessionBox.x).toBeLessThan(sessionSelectBox.x);

  await page.getByTestId("topbar-ai-button").click();
  await expect(page.getByRole("dialog", { name: "AI инструменты" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "AI инструменты" })).toHaveCount(0);

  await page.getByTestId("topbar-account-button").click();
  await expect(page.getByTestId("topbar-account-menu")).toBeVisible();
  await expect(page.getByTestId("topbar-account-profile-soon")).toBeDisabled();
  await expect(page.getByTestId("topbar-account-logout")).toBeVisible();

  await page.screenshot({
    path: "test-results/topbar-layout-brand-ai-account.after.png",
    fullPage: false,
  });
});
