import { test, expect } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const TAB_TITLES = ["Interview", "Diagram", "XML"];

function seedBpmnXml(processName = "E2E matrix process") {
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
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" name="Повар 1">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_2" name="Повар 2">
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_1" name="Шаг 1">
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
        <dc:Bounds x="120" y="60" width="1100" height="380" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_1_di" bpmnElement="Lane_1" isHorizontal="true">
        <dc:Bounds x="150" y="60" width="1070" height="190" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_2_di" bpmnElement="Lane_2" isHorizontal="true">
        <dc:Bounds x="150" y="250" width="1070" height="190" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="220" y="135" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="320" y="112" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="850" y="316" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="256" y="153" />
        <di:waypoint x="320" y="153" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="440" y="153" />
        <di:waypoint x="645" y="153" />
        <di:waypoint x="645" y="334" />
        <di:waypoint x="850" y="334" />
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

async function switchTab(page, title) {
  const rx = new RegExp(`^${title}`);
  const btn = page.locator(".segBtn").filter({ hasText: rx }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function ensureDiagramReady(page) {
  await switchTab(page, "Diagram");
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__;
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        if (!registry) return false;
        return (registry.getAll() || []).length > 0;
      });
    })
    .toBeTruthy();
}

async function createSessionFixture(request, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E matrix project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E matrix session ${runId}`,
        roles: ["Повар 1", "Повар 2", "Бригадир"],
        start_role: "Повар 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: seedBpmnXml(`E2E matrix ${runId}`) },
  });
  await apiJson(putRes, "put bpmn");

  return { projectId, sessionId };
}

async function openSession(page, fixture) {
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();

  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await ensureDiagramReady(page);
}

async function assertMarkerInInterview(page, markerLower) {
  await switchTab(page, "Interview");
  await expect
    .poll(async () => {
      return await page
        .locator(".interviewStepRow td .input")
        .evaluateAll((els, expected) =>
          els.some((el) => String(el.value || "").toLowerCase().includes(expected)), markerLower);
    })
    .toBeTruthy();
}

async function assertMarkerInDiagram(page, markerLower) {
  await switchTab(page, "Diagram");
  await expect
    .poll(async () => {
      return await page.evaluate((needle) => {
        const modeler = window.__FPC_E2E_MODELER__;
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        if (!registry) return false;
        const all = registry.getAll() || [];
        return all.some((el) => {
          const name = String(el?.businessObject?.name || "").toLowerCase();
          return name.includes(needle);
        });
      }, markerLower);
    })
    .toBeTruthy();
}

function decodeXmlEntities(raw) {
  return String(raw || "")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

async function assertMarkerInXml(page, markerLower) {
  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  await expect
    .poll(async () => decodeXmlEntities(await xmlArea.inputValue()).toLowerCase())
    .toContain(markerLower);
}

async function assertMarkerInTab(page, tab, markerLower) {
  if (tab === "Interview") return assertMarkerInInterview(page, markerLower);
  if (tab === "Diagram") return assertMarkerInDiagram(page, markerLower);
  return assertMarkerInXml(page, markerLower);
}

async function mutateFromInterview(page, marker) {
  let quickInput = page.getByPlaceholder("Быстрый ввод шага: введите действие и нажмите Enter");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await switchTab(page, "Interview");
    quickInput = page.getByPlaceholder("Быстрый ввод шага: введите действие и нажмите Enter");
    if (await quickInput.first().isVisible().catch(() => false)) break;
    await ensureDiagramReady(page);
  }
  await expect(quickInput.first()).toBeVisible();
  await quickInput.first().fill(marker);
  await quickInput.first().press("Enter");
}

async function mutateFromDiagram(page, marker) {
  await switchTab(page, "Diagram");
  await expect
    .poll(async () => await page.evaluate(() => !!window.__FPC_E2E_MODELER__))
    .toBeTruthy();

  const result = await page.evaluate((nextLabel) => {
    const modeler = window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const elementRegistry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const sourceTask = elementRegistry.get("Activity_1");
      if (!sourceTask) return { ok: false, error: "activity_1_missing" };
      modeling.updateLabel(sourceTask, nextLabel);
      modeling.moveElements([sourceTask], { x: 30, y: 0 });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, marker);

  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function mutateFromXml(page, marker) {
  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  const current = await xmlArea.inputValue();
  const replaced = String(current || "").replace(
    /(<bpmn:task\b[^>]*\bname=")[^"]*(")/i,
    `$1${marker}$2`,
  );
  expect(replaced).not.toBe(current);
  await xmlArea.fill(replaced);
}

const MUTATORS = {
  Interview: mutateFromInterview,
  Diagram: mutateFromDiagram,
  XML: mutateFromXml,
};

const EDGE_MATRIX = TAB_TITLES.flatMap((from) =>
  TAB_TITLES
    .filter((to) => to !== from)
    .map((to) => ({ from, to })),
);

test("tab transition matrix keeps autosave across all directed edges", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createSessionFixture(request, runId);
  await openSession(page, fixture);

  for (const [idx, edge] of EDGE_MATRIX.entries()) {
    const marker = `E2E matrix ${idx + 1} ${edge.from}->${edge.to} ${runId}`;
    const markerLower = marker.toLowerCase();

    const mutate = MUTATORS[edge.from];
    await mutate(page, marker);

    await switchTab(page, edge.to);
    await assertMarkerInTab(page, edge.to, markerLower);

    // Full e2e guarantee: once edge transition happened, marker remains visible in every tab.
    for (const tab of TAB_TITLES) {
      await assertMarkerInTab(page, tab, markerLower);
    }
  }
});
