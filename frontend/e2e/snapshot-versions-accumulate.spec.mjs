import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedWithPoolAndLanesXml(processName = "Snapshot accumulate") {
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
        <bpmn:flowNodeRef>Activity_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_B" name="Линия B">
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_1" name="Базовый шаг">
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
        <dc:Bounds x="80" y="40" width="1450" height="420" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_A_di" bpmnElement="Lane_A" isHorizontal="true">
        <dc:Bounds x="110" y="40" width="1420" height="210" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_B_di" bpmnElement="Lane_B" isHorizontal="true">
        <dc:Bounds x="110" y="250" width="1420" height="210" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="170" y="130" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="280" y="108" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="580" y="322" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="206" y="148" /><di:waypoint x="280" y="148" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="420" y="148" /><di:waypoint x="510" y="148" /><di:waypoint x="510" y="340" /><di:waypoint x="580" y="340" />
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
    data: { title: `E2E snapshot accumulate ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E snapshot accumulate session ${runId}`,
        roles: ["Линия A", "Линия B"],
        start_role: "Линия A",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers,
    data: { xml: seedWithPoolAndLanesXml(`Seed ${runId}`), base_diagram_state_version: 0 },
  });
  await apiJson(putRes, "seed bpmn");

  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openFixture(page, fixture, auth, options = {}) {
  if (auth?.accessToken) {
    await setUiToken(page, auth.accessToken, {
      activeOrgId: auth.activeOrgId,
      refreshToken: auth.refreshToken,
      refreshCookie: auth.refreshCookie,
    });
  }
  if (auth?.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }
  if (!options?.skipGoto) {
    await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
    await page.waitForLoadState("domcontentloaded");
  }
  await page.getByTestId("diagram-toolbar-overflow-toggle").waitFor({ state: "visible", timeout: 60000 });
}

async function waitForModelerReady(page) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        const all = registry?.getAll?.() || [];
        return all.length > 0;
      });
    })
    .toBeTruthy();
}

async function readModelerXml(page) {
  return page.evaluate(async () => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return "";
    try {
      const result = await modeler.saveXML({ format: true });
      return String(result?.xml || "");
    } catch {
      return "";
    }
  });
}

async function publishVersionViaApi(request, sessionId, headers, xml, label) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const meta = await apiJson(await request.get(
      `${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/meta`,
      { headers },
    ), `meta ${label}`);
    const res = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
      headers,
      data: {
        xml,
        source_action: "publish_manual_save",
        base_diagram_state_version: Number(meta?.diagram_state_version ?? 0),
      },
    });
    const body = await apiJson(res, `publish ${label}`);
    if (body?.ok !== false) return body;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`publishVersionViaApi failed: ${label}`);
}

async function saveAndWaitPersist(page, { createRevision = true } = {}) {
  const putPredicate = (resp) => {
    return resp.request().method() === "PUT"
      && /\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())
      && resp.status() === 200;
  };
  const responsePromise = page.waitForResponse(putPredicate);
  // «Создать версию» сохраняет с publish_manual_save одним PUT; обычное
  // сохранение — manual_save (техническая версия). Сохранение без изменений
  // дедуплицируется пайплайном: PUT может не уйти.
  const btn = createRevision
    ? page.getByTestId("diagram-toolbar-create-revision")
    : page.locator("button.processSaveBtn").first();
  await expect(btn).toBeVisible();
  await btn.click();
  await Promise.race([
    responsePromise.then(() => "put"),
    page.waitForTimeout(8000).then(() => "deduped"),
  ]);
}

async function readXml(page) {
  // XML-вкладка — CodeMirror: читаем актуальный XML напрямую из modeler runtime.
  return page.evaluate(async () => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return "";
    try {
      const result = await modeler.saveXML({ format: true });
      return String(result?.xml || "");
    } catch {
      return "";
    }
  });
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

test("snapshot versions accumulate for structural BPMN changes and restore after reload", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stepA = `STEP_A_${runId.slice(-4)}`;
  const stepB = `STEP_B_${runId.slice(-4)}`;
  const stepBrenamed = `STEP_B_RENAMED_${runId.slice(-4)}`;
  const snapshotDecisionLogs = [];
  const persistOkLogs = [];
  const putPersistCount = [];
  page.on("response", (resp) => {
    if (resp.request().method() !== "PUT") return;
    if (!/\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())) return;
    if (resp.status() === 200) putPersistCount.push(resp.url());
  });
  page.on("console", (msg) => {
    const text = String(msg.text() || "");
    if (text.includes("SNAPSHOT_DECISION")) snapshotDecisionLogs.push(text);
    if (text.includes("PERSIST_OK")) persistOkLogs.push(text);
  });

  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_snapshots", "1");
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });

  await openFixture(page, fixture, auth);
  await waitForModelerReady(page);

  const step1 = await page.evaluate(({ label }) => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const baseTask = registry.get("Activity_1");
      if (!baseTask) return { ok: false, error: "base_task_missing" };
      const root = baseTask.parent;
      const taskA = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(baseTask.x || 0) + 220, y: Number(baseTask.y || 0) },
        root,
      );
      modeling.updateLabel(taskA, label);
      modeling.connect(baseTask, taskA, { type: "bpmn:SequenceFlow" });
      return { ok: true, taskAId: String(taskA.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { label: stepA });
  expect(step1.ok, JSON.stringify(step1)).toBeTruthy();
  const xmlV1 = await readModelerXml(page);
  await publishVersionViaApi(request, fixture.sessionId, auth.headers, xmlV1, "v1");

  const step2 = await page.evaluate(({ fromId, label }) => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const fromTask = registry.get(String(fromId || ""));
      if (!fromTask) return { ok: false, error: "from_task_missing" };
      const root = fromTask.parent;
      const taskB = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(fromTask.x || 0) + 220, y: Number(fromTask.y || 0) + 120 },
        root,
      );
      modeling.updateLabel(taskB, label);
      modeling.connect(fromTask, taskB, { type: "bpmn:SequenceFlow" });
      return { ok: true, taskBId: String(taskB.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { fromId: step1.taskAId, label: stepB });
  expect(step2.ok, JSON.stringify(step2)).toBeTruthy();
  const xmlV2 = await readModelerXml(page);
  await publishVersionViaApi(request, fixture.sessionId, auth.headers, xmlV2, "v2");

  const step3 = await page.evaluate(({ taskAId, taskBId, renamed }) => {
    const modeler = window.__FPC_E2E_RUNTIME__?.getInstance?.() || window.__FPC_E2E_MODELER__;
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const taskA = registry.get(String(taskAId || ""));
      const taskB = registry.get(String(taskBId || ""));
      if (!taskA || !taskB) return { ok: false, error: "task_missing" };
      modeling.moveElements([taskA], { x: 40, y: -20 });
      modeling.updateLabel(taskB, renamed);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { taskAId: step1.taskAId, taskBId: step2.taskBId, renamed: stepBrenamed });
  expect(step3.ok, JSON.stringify(step3)).toBeTruthy();
  const xmlV3 = await readModelerXml(page);
  await publishVersionViaApi(request, fixture.sessionId, auth.headers, xmlV3, "v3");
  // Повторная публикация того же содержимого: сервер дедуплицирует (новая версия не создаётся).
  await publishVersionViaApi(request, fixture.sessionId, auth.headers, xmlV3, "v3-dedup");

  // Behavioral-проверка: версии накопились (>=3 пользовательских) с разными хэшами.
  await openVersionsModal(page);
  const versionItems = page.getByTestId("bpmn-version-item");
  await expect(versionItems.first()).toBeVisible();
  const versionCount = await versionItems.count();
  expect(versionCount).toBeGreaterThanOrEqual(3);

  const hashes = [];
  for (let i = 0; i < versionCount; i += 1) {
    const txt = await versionItems.nth(i).innerText();
    const hit = txt.match(/([0-9a-f]{8})/i);
    if (hit?.[1]) hashes.push(hit[1].toLowerCase());
  }
  expect(new Set(hashes).size).toBeGreaterThanOrEqual(3);

  await page.getByRole("button", { name: "Закрыть" }).click();

  await page.reload({ waitUntil: "domcontentloaded" });
  await openFixture(page, fixture, auth, { skipGoto: true });
  await waitForModelerReady(page);

  await openVersionsModal(page);

  const cards = page.getByTestId("bpmn-version-item");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  const cardsCount = await cards.count();
  let restored = false;
  for (let i = 0; i < cardsCount; i += 1) {
    const card = cards.nth(i);
    await card.click();
    const xmlArea = page.getByTestId("bpmn-version-preview-xml");
    if (!(await xmlArea.isVisible().catch(() => false))) {
      await page.getByTestId("bpmn-version-preview-toggle-xml").click();
    }
    await expect(xmlArea).not.toHaveValue("", { timeout: 20_000 });
    const previewXml = await xmlArea.inputValue();
    if (!previewXml.includes(stepB) || previewXml.includes(stepBrenamed)) continue;
    await page.getByTestId("bpmn-versions-pane-restore").click();
    await page.getByTestId("bpmn-versions-pane-restore-apply").click();
    restored = true;
    break;
  }
  expect(restored).toBeTruthy();

  await page.getByRole("button", { name: "Закрыть" }).click();
  await expect
    .poll(async () => {
      const xml = await readXml(page);
      return xml.includes(stepB) && !xml.includes(stepBrenamed);
    })
    .toBeTruthy();
});
