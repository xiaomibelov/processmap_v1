import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const APP_BASE = process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177";

function seedXml(processName, marker = "") {
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
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_1" name="Шаг ${marker}">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="80" y="40" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="170" y="130" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="280" y="108" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="520" y="130" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="206" y="148" /><di:waypoint x="280" y="148" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="420" y="148" /><di:waypoint x="520" y="148" />
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

async function createFixture(request, runId, headers = {}) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { title: `E2E lazy versions ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  const orgId = String(project.org_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E lazy versions session ${runId}`,
        roles: ["Линия A"],
        start_role: "Линия A",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  // Seed 25 user-facing versions by alternating small XML changes.
  for (let i = 1; i <= 25; i += 1) {
    const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
      headers,
      data: {
        xml: seedXml(`Version ${i}`, `v${i}`),
        source_action: "publish_manual_save",
        base_diagram_state_version: i - 1,
        base_bpmn_xml_version: i - 1,
      },
    });
    await apiJson(putRes, `seed version ${i}`);
  }

  return { projectId, sessionId, orgId };
}

async function openFixture(page, fixture) {
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");

  // Handle multi-org account initial prompt.
  const orgChoice = page.getByText("Выберите организацию");
  if (await orgChoice.isVisible().catch(() => false)) {
    const defaultOrg = page.getByRole("button", { name: "Default" }).first();
    if (await defaultOrg.count() > 0) {
      await defaultOrg.click();
    } else {
      await page.getByRole("button").first().click();
    }
    await page.waitForTimeout(500);
  }

  await waitForDiagramReady(page);

  const diagramTab = page.locator(".segBtn").filter({ hasText: /^Diagram$/i }).first();
  if (await diagramTab.isVisible().catch(() => false)) {
    await diagramTab.click();
  }
}

async function openVersionsModal(page) {
  const overflowToggle = page.getByTestId("diagram-toolbar-overflow-toggle");
  await expect(overflowToggle).toBeVisible();
  await overflowToggle.click();

  const trigger = page.getByTestId("bpmn-versions-open");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByTestId("bpmn-versions-modal")).toBeVisible();
}

test("BPMN version history modal lazy loads paginated versions", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });

  await setUiToken(page, auth.accessToken, {
    activeOrgId: auth.activeOrgId,
    refreshToken: auth.refreshToken,
    refreshCookie: auth.refreshCookie,
  });

  if (auth.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }

  await openFixture(page, fixture);

  // Wait for the modeler to be ready by polling the runtime modeler.
  await waitForDiagramReady(page);

  const modalOpenStart = Date.now();
  await openVersionsModal(page);
  const modalOpenDuration = Date.now() - modalOpenStart;
  expect(modalOpenDuration).toBeLessThan(500);

  // First page: 10 versions out of 25.
  const shownCount = page.getByTestId("bpmn-versions-shown-count");
  await expect(shownCount).toContainText(/Показано 10 из 25/);

  const versionItems = page.getByTestId("bpmn-version-item");
  await expect(versionItems).toHaveCount(10);

  const loadMoreBtn = page.getByTestId("bpmn-versions-load-more");
  await expect(loadMoreBtn).toBeVisible();
  await loadMoreBtn.click();

  // Second page: 20 versions.
  await expect(shownCount).toContainText(/Показано 20 из 25/);
  await expect(versionItems).toHaveCount(20);

  await loadMoreBtn.click();

  // Third page: all 25 versions, load-more button hidden.
  await expect(shownCount).toContainText(/Показано 25 из 25/);
  await expect(versionItems).toHaveCount(25);
  await expect(loadMoreBtn).not.toBeVisible();
  await expect(page.locator("text=Все версии загружены")).toBeVisible();

  // Close modal and verify there is no raw "not found" toast/notification.
  await page.getByRole("button", { name: "Закрыть" }).click();
  await expect(page.getByTestId("bpmn-versions-modal")).not.toBeVisible();
});
