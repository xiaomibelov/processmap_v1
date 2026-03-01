import { expect, test } from "@playwright/test";
import { apiLogin } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  createFixture,
  switchTab,
} from "./helpers/processFixture.mjs";

function seedXmlWithPmRobotMeta({ processName = "RobotMeta import", taskName = "Robot Task import" } = {}) {
  const robotMetaJson = JSON.stringify({
    robot_meta_version: "v1",
    exec: {
      mode: "machine ",
      executor: " node_red ",
      action_key: " robot.import ",
      timeout_sec: 30,
      retry: { max_attempts: 2, backoff_sec: 4 },
    },
    mat: {
      from_zone: " cold ",
      to_zone: " heat ",
      inputs: [],
      outputs: [],
    },
    qc: {
      critical: true,
      checks: [],
    },
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:pm="http://processmap.ai/schema/bpmn/1.0"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="${processName}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="${taskName}">
      <bpmn:extensionElements>
        <pm:RobotMeta version="v1">${robotMetaJson}</pm:RobotMeta>
      </bpmn:extensionElements>
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

function e2eUiCreds() {
  return {
    email: String(process.env.E2E_USER || process.env.E2E_ADMIN_EMAIL || "admin@local").trim(),
    password: String(process.env.E2E_PASS || process.env.E2E_ADMIN_PASSWORD || "admin"),
  };
}

async function uiLogin(page) {
  const creds = e2eUiCreds();
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Пароль").fill(creds.password);
  await page.getByRole("button", { name: "Войти в систему" }).click();
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
}

async function openFixtureInTopbar(page, fixture) {
  await page.goto("/app");
  const projectSelect = page.getByTestId("topbar-project-select");
  const sessionSelect = page.getByTestId("topbar-session-select");
  await expect(projectSelect).toBeVisible();
  await projectSelect.selectOption(String(fixture.projectId || ""));
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await sessionSelect.selectOption(String(fixture.sessionId || ""));
}

async function waitForModelerReady(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return Boolean(window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.());
      });
    })
    .toBeTruthy();
}

async function ensureSidebarOpen(page) {
  const openBtn = page.getByRole("button", { name: "Открыть панель" });
  if (await openBtn.isVisible().catch(() => false)) {
    await openBtn.click();
  }
}

async function selectElementForDetails(page, elementId = "Task_1") {
  const selected = await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const element = modeler.get("elementRegistry").get(String(targetId || "Task_1"));
      if (!element) return { ok: false, error: "element_missing" };
      const selection = modeler.get("selection");
      selection?.select?.(element);
      modeler.get("eventBus")?.fire?.("element.click", { element });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, elementId);
  expect(selected.ok, JSON.stringify(selected)).toBeTruthy();
}

test("robot meta: hydrate from BPMN extension on import with trim normalization", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_import`,
    auth.headers,
    seedXmlWithPmRobotMeta({ processName: `RobotMeta import ${runId}`, taskName: "Robot Task import" }),
  );

  await uiLogin(page);
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await ensureSidebarOpen(page);
  await selectElementForDetails(page, "Task_1");

  await expect(page.getByTestId("robotmeta-mode")).toHaveValue("machine");
  await expect(page.getByTestId("robotmeta-executor")).toHaveValue("node_red");
  await expect(page.getByTestId("robotmeta-action-key")).toHaveValue("robot.import");
  await expect(page.getByTestId("robotmeta-timeout-sec")).toHaveValue("30");
  await expect(page.getByTestId("robotmeta-retry-max")).toHaveValue("2");
  await expect(page.getByTestId("robotmeta-retry-backoff")).toHaveValue("4");
  await expect(page.getByTestId("robotmeta-from-zone")).toHaveValue("cold");
  await expect(page.getByTestId("robotmeta-to-zone")).toHaveValue("heat");
  await expect(page.getByTestId("robotmeta-qc-critical")).toBeChecked();

  await page.reload();
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await ensureSidebarOpen(page);
  await selectElementForDetails(page, "Task_1");
  await expect(page.getByTestId("robotmeta-mode")).toHaveValue("machine");
  await expect(page.getByTestId("robotmeta-action-key")).toHaveValue("robot.import");
});
