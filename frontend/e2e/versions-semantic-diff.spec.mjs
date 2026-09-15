import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedBpmnXml(processName = "Versions semantic diff seed") {
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
      <bpmn:lane id="Lane_A" name="Линия A">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_A</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_B</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_A" name="Подготовка">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_B" name="Проверка">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_A" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="Task_B" name="если ок" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_B" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="120" y="80" width="980" height="280" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_A_di" bpmnElement="Lane_A" isHorizontal="true">
        <dc:Bounds x="150" y="80" width="950" height="280" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="200" y="192" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="320" y="170" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="540" y="170" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="760" y="192" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="236" y="210" /><di:waypoint x="320" y="210" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="440" y="210" /><di:waypoint x="540" y="210" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="660" y="210" /><di:waypoint x="760" y="210" />
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

async function createFixture(request, runId, authHeaders) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: { title: `E2E semantic diff ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: authHeaders,
      data: {
        title: `E2E semantic diff session ${runId}`,
        roles: ["Линия A"],
        start_role: "Линия A",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const metaRes = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/meta`, {
    headers: authHeaders,
  });
  const meta = await apiJson(metaRes, "get session meta");
  const baseDiagramStateVersion = Number(meta?.diagram_state_version ?? 0);

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers: authHeaders,
    data: {
      xml: seedBpmnXml(`Seed ${runId}`),
      base_diagram_state_version: baseDiagramStateVersion,
    },
  });
  await apiJson(putRes, "seed bpmn");
  return { projectId, sessionId };
}

async function seedVersionCas(request, sessionId, headers, xml, label) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const meta = await apiJson(await request.get(
      `${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/meta`,
      { headers },
    ), `get session meta ${label}`);
    const res = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
      headers,
      data: {
        xml,
        source_action: "publish_manual_save",
        base_diagram_state_version: Number(meta?.diagram_state_version ?? 0),
      },
    });
    const body = await apiJson(res, `seed ${label}`);
    if (body?.ok !== false) return body;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`seedVersionCas failed: ${label}`);
}

async function openFixture(page, fixture, accessToken, options = {}) {
  if (!options?.skipGoto) {
    await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
    await page.waitForLoadState("domcontentloaded");
    // Мульт-org аккаунт: подтверждаем org-choice, если он всё же показался.
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
  }
  await waitForDiagram(page);
}

async function waitForDiagram(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        return (registry?.getAll?.() || []).length > 0;
      });
    })
    .toBeTruthy();
}

async function saveAndWaitPut(page) {
  const putOk = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && /\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())
      && resp.status() === 200;
  });
  await page.locator("button.processSaveBtn").first().click();
  await putOk;
}

async function openVersionsModal(page) {
  const overflowToggle = page.getByTestId("diagram-toolbar-overflow-toggle");
  await expect(overflowToggle).toBeVisible();
  await overflowToggle.click();
  const trigger = page.getByTestId("bpmn-versions-open");
  await expect(trigger).toBeVisible();
  await trigger.evaluate((node) => node.click());
  await expect(page.getByTestId("bpmn-versions-modal")).toBeVisible();
}

async function closeVersionsModal(page) {
  await page.getByRole("button", { name: "Закрыть" }).first().click();
}

test("versions semantic diff shows changed tasks/condition inside the history modal", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const marker = runId.slice(-5);
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);

  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_debug_snapshots", "1");
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_tabs", "1");
    window.localStorage.setItem("fpc_debug_trace", "1");
  });
  await setUiToken(page, auth.accessToken);
  if (auth.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }
  await openFixture(page, fixture, auth.accessToken);
  await waitForDiagram(page);

  // Версия 1 (пользовательская): базовые имена (отличаются от технического сида createFixture).
  const xmlV1 = seedBpmnXml(`Seed ${runId}`)
    .replace('name="Подготовка"', 'name="Подготовка база"')
    .replace('name="Проверка"', 'name="Проверка база"');
  await seedVersionCas(request, fixture.sessionId, auth.headers, xmlV1, "user version 1");

  // Версия 2 (пользовательская): изменены 2 задачи + имя/условие потока.
  const xmlV2 = seedBpmnXml(`Seed ${runId}`)
    .replace('name="Подготовка"', `name="Подготовка ${marker}"`)
    .replace('name="Проверка"', `name="Проверка ${marker}"`)
    .replace('name="если ок"', `name="если_риски_${marker}"`);
  await seedVersionCas(request, fixture.sessionId, auth.headers, xmlV2, "user version 2");

  await openVersionsModal(page);
  const probe = await apiJson(await request.get(
    `${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn/versions?limit=10&offset=0&include_technical=true`,
    { headers: auth.headers },
  ), "probe versions");
  console.log("[PROBE] all versions:", Number(probe?.count || 0), (probe?.items || []).map((i) => `${i.id}/${i.source_action}`).join(" | "));
  const cards = page.getByTestId("bpmn-version-item");
  await expect(cards).toHaveCount(2);

  const ids = await page.locator("[data-testid='bpmn-version-item']").evaluateAll((nodes) => {
    return nodes.map((node) => String(node.getAttribute("data-snapshot-id") || "")).filter(Boolean);
  });
  expect(ids.length).toBeGreaterThanOrEqual(2);
  const latestId = String(ids[0] || "");
  const olderId = String(ids[1] || "");
  expect(latestId).not.toBe("");
  expect(olderId).not.toBe("");

  // Сравнение живёт в главной модалке: назначаем пару A/B метками на карточках.
  await page.locator(`[data-snapshot-id="${olderId}"] [data-testid="bpmn-version-assign-a"]`).click();
  await page.locator(`[data-snapshot-id="${latestId}"] [data-testid="bpmn-version-assign-b"]`).click();
  await expect(page.getByTestId("bpmn-versions-compare-header")).toBeVisible();
  // Diff считается с дебаунсом 300 ms после установки пары; изменены 2 задачи (+1 поток с условием).
  await expect(page.getByTestId("bpmn-versions-legend-changed")).toContainText(/изменено\s*[2-4]/);
  await expect(page.getByTestId("bpmn-versions-no-changes")).toHaveCount(0);
  // Маркеры изменений появляются на панелях сравнения.
  await expect(page.locator(".bpmnVersionPreview .djs-element.vcc-changed").first()).toBeVisible();
  // XML-режим: построчный line-diff обеих версий.
  await page.getByTestId("bpmn-versions-mode-xml").click();
  await expect(page.getByTestId("bpmn-versions-xml-diff").first()).toBeVisible();
  await expect(page.locator("[data-diff-kind='removed']").first()).toBeVisible();
  await expect(page.locator("[data-diff-kind='added']").first()).toBeVisible();
  await page.getByTestId("bpmn-versions-mode-diagram").click();

  await closeVersionsModal(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await openFixture(page, fixture, auth.accessToken, { skipGoto: true });
  await waitForDiagram(page);
  await openVersionsModal(page);
  // Без закрепления порядок остаётся «новые сверху»: первой идёт latest-версия.
  await expect(page.locator("[data-testid='bpmn-version-item']").first()).toHaveAttribute("data-snapshot-id", latestId);
});
