import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

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
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:userTask id="Task_1" name="Подготовка" />
    <bpmn:serviceTask id="Task_2" name="Проверка" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="120" y="170" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="220" y="145" width="160" height="86" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2"><dc:Bounds x="450" y="145" width="160" height="86" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="680" y="170" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="156" y="188" /><di:waypoint x="220" y="188" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="380" y="188" /><di:waypoint x="450" y="188" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="610" y="188" /><di:waypoint x="680" y="188" /></bpmndi:BPMNEdge>
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
    data: { title: `E2E coverage matrix ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E coverage matrix session ${runId}`,
        roles: ["Оператор"],
        start_role: "Оператор",
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

async function readFocusMetrics(page, elementId) {
  return await page.evaluate((id) => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const canvas = modeler.get("canvas");
      const registry = modeler.get("elementRegistry");
      const el = registry.get(String(id || ""));
      if (!el) return { ok: false, error: "element_missing" };
      const vb = canvas.viewbox?.() || { x: 0, y: 0, width: 0, height: 0 };
      const zoom = Number(canvas.zoom?.() || 0);
      const centerX = Number(el.x || 0) + Number(el.width || 0) / 2;
      const centerY = Number(el.y || 0) + Number(el.height || 0) / 2;
      const marginX = Math.min(centerX - Number(vb.x || 0), Number(vb.x || 0) + Number(vb.width || 0) - centerX);
      const marginY = Math.min(centerY - Number(vb.y || 0), Number(vb.y || 0) + Number(vb.height || 0) - centerY);
      const hasJump = typeof canvas.hasMarker === "function"
        ? !!canvas.hasMarker(el, "fpcAttentionJumpFocus")
        : false;
      return {
        ok: true,
        hasJump,
        zoom,
        ratioX: Number(vb.width || 0) > 1 ? Number(marginX || 0) / Number(vb.width) : 0,
        ratioY: Number(vb.height || 0) > 1 ? Number(marginY || 0) / Number(vb.height) : 0,
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error || "metrics_failed") };
    }
  }, elementId);
}

test("coverage matrix shows missing data and focuses element on click", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_leftpanel_hidden", "0");
  });
  await setUiToken(page, auth.accessToken);
  await page.goto("/app");
  await openFixture(page, fixture);
  await switchTab(page, "Diagram");

  await page.getByTestId("diagram-coverage-open").click();
  await expect(page.getByTestId("coverage-panel")).toBeVisible();
  await expect(page.getByTestId("coverage-panel")).toContainText("без notes");

  const firstIssue = page.getByTestId("coverage-issue-item").first();
  await expect(firstIssue).toBeVisible();
  const firstId = String((await firstIssue.getAttribute("data-element-id")) || "").trim();
  expect(firstId).not.toBe("");
  await firstIssue.click();

  await expect
    .poll(async () => {
      const m = await readFocusMetrics(page, firstId);
      return m.ok ? (m.hasJump ? 1 : 0) : 0;
    })
    .toBe(1);
  const metrics = await readFocusMetrics(page, firstId);
  expect(metrics.ok, JSON.stringify(metrics)).toBeTruthy();
  expect(metrics.zoom).toBeGreaterThan(0.8);
  expect(metrics.zoom).toBeLessThan(1.15);
  expect(metrics.ratioX).toBeGreaterThan(0.1);
  expect(metrics.ratioY).toBeGreaterThan(0.1);

  const notesSection = page.locator("#element-notes-section");
  await expect(notesSection).toBeVisible();
  await expect(notesSection).toContainText(firstId);
});
