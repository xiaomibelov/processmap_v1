import { expect, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function pathOf(urlString) {
  try {
    return new URL(urlString).pathname;
  } catch {
    return "";
  }
}

function bigBpmnXml(runId, task3Label) {
  const processName = `E2E Big Matrix ${runId}`;
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
      <bpmn:lane id="Lane_1" name="Линия 1">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_2</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_3</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Gateway_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_4</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_2" name="Линия 2">
        <bpmn:flowNodeRef>Activity_5</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_6</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_7</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Activity_8</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_1" name="Подготовка сырья">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_2" name="Проверка качества">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_3" name="${task3Label}">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:task>
    <bpmn:exclusiveGateway id="Gateway_1" name="Маршрут">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Activity_4" name="Упаковка A">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:outgoing>Flow_7</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_5" name="Упаковка B">
      <bpmn:incoming>Flow_6</bpmn:incoming>
      <bpmn:outgoing>Flow_8</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_6" name="Маркировка A">
      <bpmn:incoming>Flow_7</bpmn:incoming>
      <bpmn:outgoing>Flow_9</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_7" name="Маркировка B">
      <bpmn:incoming>Flow_8</bpmn:incoming>
      <bpmn:outgoing>Flow_10</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Activity_8" name="Финальный контроль">
      <bpmn:incoming>Flow_9</bpmn:incoming>
      <bpmn:incoming>Flow_10</bpmn:incoming>
      <bpmn:outgoing>Flow_11</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_11</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="Activity_2" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Activity_2" targetRef="Activity_3" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Activity_3" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Gateway_1" targetRef="Activity_4" name="ветка A" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Gateway_1" targetRef="Activity_5" name="ветка B" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Activity_4" targetRef="Activity_6" />
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Activity_5" targetRef="Activity_7" />
    <bpmn:sequenceFlow id="Flow_9" sourceRef="Activity_6" targetRef="Activity_8" />
    <bpmn:sequenceFlow id="Flow_10" sourceRef="Activity_7" targetRef="Activity_8" />
    <bpmn:sequenceFlow id="Flow_11" sourceRef="Activity_8" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="100" y="40" width="1700" height="460" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_1_di" bpmnElement="Lane_1" isHorizontal="true">
        <dc:Bounds x="130" y="40" width="1670" height="230" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_2_di" bpmnElement="Lane_2" isHorizontal="true">
        <dc:Bounds x="130" y="270" width="1670" height="230" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="130" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="260" y="108" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_2_di" bpmnElement="Activity_2">
        <dc:Bounds x="450" y="108" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_3_di" bpmnElement="Activity_3">
        <dc:Bounds x="640" y="108" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1" isMarkerVisible="true">
        <dc:Bounds x="850" y="120" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_4_di" bpmnElement="Activity_4">
        <dc:Bounds x="960" y="90" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_5_di" bpmnElement="Activity_5">
        <dc:Bounds x="960" y="320" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_6_di" bpmnElement="Activity_6">
        <dc:Bounds x="1160" y="90" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_7_di" bpmnElement="Activity_7">
        <dc:Bounds x="1160" y="320" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_8_di" bpmnElement="Activity_8">
        <dc:Bounds x="1360" y="230" width="160" height="90" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="1590" y="257" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="216" y="148" />
        <di:waypoint x="260" y="148" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="400" y="148" />
        <di:waypoint x="450" y="148" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="590" y="148" />
        <di:waypoint x="640" y="148" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="780" y="148" />
        <di:waypoint x="850" y="145" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5">
        <di:waypoint x="900" y="145" />
        <di:waypoint x="960" y="130" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6">
        <di:waypoint x="900" y="145" />
        <di:waypoint x="930" y="145" />
        <di:waypoint x="930" y="360" />
        <di:waypoint x="960" y="360" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_7_di" bpmnElement="Flow_7">
        <di:waypoint x="1100" y="130" />
        <di:waypoint x="1160" y="130" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_8_di" bpmnElement="Flow_8">
        <di:waypoint x="1100" y="360" />
        <di:waypoint x="1160" y="360" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_9_di" bpmnElement="Flow_9">
        <di:waypoint x="1300" y="130" />
        <di:waypoint x="1340" y="130" />
        <di:waypoint x="1340" y="275" />
        <di:waypoint x="1360" y="275" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_10_di" bpmnElement="Flow_10">
        <di:waypoint x="1300" y="360" />
        <di:waypoint x="1340" y="360" />
        <di:waypoint x="1340" y="275" />
        <di:waypoint x="1360" y="275" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_11_di" bpmnElement="Flow_11">
        <di:waypoint x="1520" y="275" />
        <di:waypoint x="1590" y="275" />
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

async function createFixture(request, runId, xmlText) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E tab matrix project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E tab matrix session ${runId}`,
        roles: ["Линия 1", "Линия 2"],
        start_role: "Линия 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: xmlText },
  });
  await apiJson(putRes, "put bpmn");

  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const rx = new RegExp(`^${title}$`, "i");
  const btn = page.locator(".segBtn").filter({ hasText: rx }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openFixture(page, fixture) {
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_tabs", "1");
  });
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

async function assertDiagramVisible(page, label) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        const all = registry?.getAll?.() || [];
        const canvas = modeler.get("canvas");
        const svg = canvas?._container?.querySelector?.("svg");
        const rect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
        return all.length > 0 && Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0;
      });
    }, label)
    .toBeTruthy();
}

async function readXml(page) {
  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  const xml = await xmlArea.inputValue();
  return { xml, len: xml.length, hash: fnv1aHex(xml) };
}

test("tab matrix on big diagram blocks stale rollback on Interview -> XML -> Diagram chains", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const seedLabel = `seed_${runId.slice(-4)}`;
  const updatedLabel = `updated_${runId.slice(-4)}`;
  const staleXml = bigBpmnXml(runId, seedLabel);
  const stableXml = bigBpmnXml(runId, updatedLabel);
  const fixture = await createFixture(request, runId, stableXml);
  const sid = fixture.sessionId;

  let phase = "setup";
  let getOnCycle = 0;
  let patchCount = 0;

  page.on("request", (req) => {
    const p = pathOf(req.url());
    if (phase === "cycle" && req.method() === "GET" && p === `/api/sessions/${sid}/bpmn`) {
      getOnCycle += 1;
    }
  });

  await openFixture(page, fixture);
  await assertDiagramVisible(page, "diagram_ready_initial");

  await page.route(`**/api/sessions/${sid}`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    patchCount += 1;
    const backend = await route.fetch();
    const bodyText = await backend.text();
    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = {};
    }
    body = body && typeof body === "object" ? body : {};
    body.bpmn_xml = staleXml;
    await route.fulfill({
      status: backend.status(),
      headers: { ...backend.headers(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  const baseline = await readXml(page);
  expect(baseline.xml).toContain(updatedLabel);
  expect(baseline.xml).not.toContain(seedLabel);
  await switchTab(page, "Diagram");

  const chains = [
    ["XML", "Diagram"],
    ["Interview", "Diagram"],
    ["Interview", "XML", "Diagram"],
    ["XML", "Interview", "Diagram"],
    ["Interview", "Diagram", "XML", "Interview", "Diagram"],
    ["XML", "Diagram", "Interview", "Diagram", "XML", "Diagram"],
    ["Interview", "Diagram"],
    ["Interview", "Diagram"],
    ["Interview", "Diagram"],
    ["XML", "Diagram"],
    ["Interview", "XML", "Diagram"],
    ["XML", "Interview", "XML", "Diagram"],
  ];

  phase = "cycle";
  for (let i = 0; i < chains.length; i += 1) {
    const chain = chains[i];
    const label = `chain_${i + 1}:${chain.join("->")}`;
    for (let j = 0; j < chain.length; j += 1) {
      const target = chain[j];
      await switchTab(page, target);
      if (target.toLowerCase() === "diagram") {
        await assertDiagramVisible(page, `${label}:diagram_${j + 1}`);
      }
      if (target.toLowerCase() === "xml") {
        const snap = await readXml(page);
        if (!snap.xml.includes(updatedLabel) || snap.xml.includes(seedLabel)) {
          throw new Error(
            `[ROLLBACK_DETECTED] ${label}:xml_${j + 1} len=${snap.len} hash=${snap.hash} `
            + `hasUpdated=${snap.xml.includes(updatedLabel) ? 1 : 0} hasSeed=${snap.xml.includes(seedLabel) ? 1 : 0} `
            + `head=${snap.xml.slice(0, 140)}`,
          );
        }
      }
    }
  }

  expect(patchCount).toBeGreaterThan(0);
  expect(getOnCycle).toBe(0);
});

