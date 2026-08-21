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

function seedXmlWithoutEnd() {
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
    <bpmn:task id="Task_1" name="Проверка">
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
    data: { title: `E2E quality lint ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E quality lint session ${runId}`,
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
    data: { xml: seedXmlWithoutEnd() },
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

test("quality lint: missing endEvent is reported and disappears after fix", async ({ page, request }) => {
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
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await setUiToken(page, auth.accessToken);
  await page.goto("/app");
  await openFixture(page, fixture);
  await switchTab(page, "Diagram");

  const toggle = page.getByTestId("diagram-quality-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();

  const panel = page.getByTestId("quality-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("В процессе отсутствует endEvent");

  const firstIssue = page.getByTestId("quality-issue-item").first();
  await expect(firstIssue).toBeVisible();
  const focusNodeId = String((await firstIssue.getAttribute("data-node-id")) || "").trim();
  await firstIssue.getByRole("button", { name: "Показать на схеме" }).click();
  if (focusNodeId) {
    await expect
      .poll(async () => {
        const m = await readFocusMetrics(page, focusNodeId);
        return m.ok ? (m.hasJump ? 1 : 0) : 0;
      })
      .toBe(1);
    const focusMetrics = await readFocusMetrics(page, focusNodeId);
    expect(focusMetrics.ok, JSON.stringify(focusMetrics)).toBeTruthy();
    expect(focusMetrics.zoom).toBeGreaterThan(0.8);
    expect(focusMetrics.zoom).toBeLessThan(1.15);
    expect(focusMetrics.ratioX).toBeGreaterThan(0.1);
    expect(focusMetrics.ratioY).toBeGreaterThan(0.1);
  } else {
    await expect
      .poll(async () => {
        return await page.evaluate(() => document.querySelectorAll(".djs-element.fpcAttentionJumpFocus, .djs-connection.fpcAttentionJumpFocus").length);
      })
      .toBeGreaterThan(0);
    const zoom = await page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__;
      if (!modeler) return 0;
      return Number(modeler.get("canvas")?.zoom?.() || 0);
    });
    expect(zoom).toBeGreaterThan(0.8);
    expect(zoom).toBeLessThan(1.15);
  }

  const persistBeforeFix = persistOkCount;
  const created = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const elementFactory = modeler.get("elementFactory");
      const modeling = modeler.get("modeling");
      const canvas = modeler.get("canvas");
      const registry = modeler.get("elementRegistry");
      const root = canvas.getRootElement();
      const parent = root && String(root.type || "") === "bpmn:Process"
        ? root
        : (registry.get("Process_1") || root);
      const task = registry.get("Task_1")
        || (registry.filter((el) => String(el?.type || "").endsWith("Task")) || [])[0];
      if (!task) return { ok: false, error: "task_missing" };

      const endShape = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:EndEvent" }),
        {
          x: Number(task.x || 320) + 300,
          y: Number(task.y || 180) + 40,
        },
        parent,
      );
      modeling.connect(task, endShape, { type: "bpmn:SequenceFlow" });
      return { ok: true, endId: String(endShape?.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(created.ok, JSON.stringify(created)).toBeTruthy();
  await expect.poll(() => persistOkCount).toBeGreaterThan(persistBeforeFix);

  await expect
    .poll(async () => {
      return await page.getByTestId("quality-panel").innerText();
    })
    .not.toMatch(/В процессе отсутствует endEvent/i);
});
