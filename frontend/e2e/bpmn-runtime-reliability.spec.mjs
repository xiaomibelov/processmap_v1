import { test, expect } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function seedBpmnXml(processName = "E2E runtime reliability") {
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
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_1" name="Base Task">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Finish">
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
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="220" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="340" y="138" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="620" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="256" y="178" />
        <di:waypoint x="340" y="178" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="460" y="178" />
        <di:waypoint x="620" y="178" />
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

async function createSessionFixture(request, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E reliability project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E reliability session ${runId}`,
        roles: ["Cook A", "Cook B"],
        start_role: "Cook A",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: seedBpmnXml(`E2E runtime ${runId}`) },
  });
  await apiJson(putRes, "put bpmn");

  return { projectId, sessionId };
}

async function enableBpmnDebug(page, options = {}) {
  const importDelayMs = Number(options?.importDelayMs || 0);
  await page.addInitScript((delay) => {
    window.__FPC_E2E__ = true;
    window.__FPC_DEBUG_BPMN__ = true;
    try {
      window.localStorage.setItem("fpc_debug_bpmn", "1");
    } catch {
      // no-op
    }
    window.__FPC_E2E_DELAY_IMPORT_MS__ = Number.isFinite(Number(delay)) ? Number(delay) : 0;
  }, importDelayMs);
}

async function openSession(page, fixture, options = {}) {
  if (options.skipGoto !== true) {
    await page.goto("/");
  }
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  if (options.waitDiagram !== false) {
    await waitForModelerReady(page);
  }
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}`) }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function waitForModelerReady(page) {
  await switchTab(page, "Diagram");
  await expect(page.locator(".segBtn.on").first()).toContainText("Diagram");
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const runtime = window.__FPC_E2E_RUNTIME__;
        if (runtime && typeof runtime.getStatus === "function" && typeof runtime.getInstance === "function") {
          const status = runtime.getStatus() || {};
          if (status.ready && status.defs && runtime.getInstance()) {
            return true;
          }
        }
        const modeler = window.__FPC_E2E_MODELER__;
        if (!modeler) return false;
        try {
          return !!modeler.getDefinitions?.();
        } catch {
          return false;
        }
      });
    }, { timeout: 45_000 })
    .toBeTruthy();
}

function createTelemetry(page, sessionId) {
  const logs = [];
  const errors = [];
  const responses = [];
  const sessionPath = `/api/sessions/${encodeURIComponent(sessionId)}`;

  page.on("console", (msg) => {
    const text = String(msg.text() || "");
    logs.push({ ts: Date.now(), type: msg.type(), text });
    if (/no definitions loaded/i.test(text)) {
      errors.push(`console:${text}`);
    }
  });
  page.on("pageerror", (error) => {
    const text = String(error?.message || error || "");
    errors.push(`pageerror:${text}`);
  });
  page.on("response", (res) => {
    const url = String(res.url() || "");
    if (!url.includes(sessionPath)) return;
    const method = String(res.request().method() || "GET").toUpperCase();
    responses.push({
      ts: Date.now(),
      method,
      url,
      status: res.status(),
    });
  });

  return { logs, errors, responses };
}

function parseBpmnTag(text) {
  const m = String(text || "").match(/\[BPMN\]\s+([A-Za-z0-9_.-]+)/);
  return m ? m[1] : "";
}

function parseMetaNumber(text, key) {
  const src = String(text || "");
  const m = src.match(new RegExp(`\\b${String(key)}=(-?\\d+)\\b`));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function getTagEntries(logs, tag, fromTs = 0) {
  return logs.filter((entry) => entry.ts >= fromTs && parseBpmnTag(entry.text) === tag);
}

function firstTagTs(logs, tag, minTs = 0) {
  const hit = logs.find((entry) => entry.ts >= minTs && parseBpmnTag(entry.text) === tag);
  return hit ? hit.ts : -1;
}

function extractRevFromEntry(entry) {
  return parseMetaNumber(entry?.text, "rev");
}

function extractAppliedRev(entry) {
  const rev = parseMetaNumber(entry?.text, "rev");
  const localRev = parseMetaNumber(entry?.text, "local_rev");
  const loadedRev = parseMetaNumber(entry?.text, "loaded_rev");
  return Math.max(rev || 0, localRev || 0, loadedRev || 0);
}

function expectNoDefinitionsErrors(telemetry) {
  const errors = telemetry.errors.filter((line) => /no definitions loaded/i.test(String(line || "")));
  const consoleHits = telemetry.logs.filter((entry) => /no definitions loaded/i.test(String(entry.text || "")));
  expect(errors, errors.join("\n")).toHaveLength(0);
  expect(consoleHits.map((x) => x.text), consoleHits.map((x) => x.text).join("\n")).toHaveLength(0);
}

async function mutateCreateRenameConnectDelete(page, prefix) {
  let result = { ok: false, error: "not_started" };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    result = await page.evaluate((labelPrefix) => {
      const runtime = window.__FPC_E2E_RUNTIME__;
      const runtimeStatus = runtime?.getStatus?.() || null;
      const runtimeModeler = runtime?.getInstance?.();
      const modeler = (runtimeStatus?.ready && runtimeStatus?.defs && runtimeModeler)
        ? runtimeModeler
        : (window.__FPC_E2E_MODELER__ || runtimeModeler);
      if (!modeler) return { ok: false, error: "modeler_missing" };
      try {
        const elementRegistry = modeler.get("elementRegistry");
        const modeling = modeler.get("modeling");
        const elementFactory = modeler.get("elementFactory");
        const canvas = modeler.get("canvas");
        const root = canvas.getRootElement();
        if (!root) return { ok: false, error: "root_missing" };
        const all = typeof elementRegistry.getAll === "function" ? elementRegistry.getAll() : [];
        let sourceTask = elementRegistry.get("Activity_1")
          || (elementRegistry.filter?.((el) => String(el?.type || "").endsWith("Task")) || [])[0]
          || all.find((el) => !Array.isArray(el?.waypoints) && el?.type !== "label" && !!el?.businessObject && !String(el?.type || "").includes("Process"));
        if (!sourceTask) {
          sourceTask = modeling.createShape(
            elementFactory.createShape({ type: "bpmn:Task" }),
            { x: 320, y: 180 },
            root,
          );
        }
        const parent = sourceTask.parent || root;
        modeling.updateLabel(sourceTask, `${labelPrefix} renamed`);
        let created = null;
        try {
          created = modeling.createShape(
            elementFactory.createShape({ type: "bpmn:Task" }),
            {
              x: Number(sourceTask.x || 0) + 260,
              y: Number(sourceTask.y || 0),
            },
            parent,
          );
          if (created) {
            modeling.updateLabel(created, `${labelPrefix} linked`);
            try {
              modeling.connect(sourceTask, created, { type: "bpmn:SequenceFlow" });
            } catch {
              // Some imported snapshots may have implicit roots; keep mutation flow stable.
            }
          }
        } catch {
          // Continue: rename mutation is still enough to verify persistence path.
        }

        try {
          const temp = modeling.createShape(
            elementFactory.createShape({ type: "bpmn:Task" }),
            {
              x: Number(sourceTask.x || 0) + 70,
              y: Number(sourceTask.y || 0) + 180,
            },
            parent,
          );
          if (temp) {
            modeling.updateLabel(temp, `${labelPrefix} to-delete`);
            modeling.removeElements([temp]);
          }
        } catch {
          // Optional delete mutation.
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
    }, prefix);
    if (result.ok) break;
    await page.waitForTimeout(160);
  }
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function mutateRenameOnly(page, nextLabel) {
  let result = { ok: false, error: "not_started" };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    result = await page.evaluate((label) => {
      const runtime = window.__FPC_E2E_RUNTIME__;
      const runtimeStatus = runtime?.getStatus?.() || null;
      const runtimeModeler = runtime?.getInstance?.();
      const modeler = (runtimeStatus?.ready && runtimeStatus?.defs && runtimeModeler)
        ? runtimeModeler
        : (window.__FPC_E2E_MODELER__ || runtimeModeler);
      if (!modeler) return { ok: false, error: "modeler_missing" };
      try {
        const elementRegistry = modeler.get("elementRegistry");
        const modeling = modeler.get("modeling");
        const elementFactory = modeler.get("elementFactory");
        const canvas = modeler.get("canvas");
        const root = canvas.getRootElement();
        if (!root) return { ok: false, error: "root_missing" };
        const all = typeof elementRegistry.getAll === "function" ? elementRegistry.getAll() : [];
        let task = elementRegistry.get("Activity_1")
          || (elementRegistry.filter?.((el) => String(el?.type || "").endsWith("Task")) || [])[0]
          || all.find((el) => !Array.isArray(el?.waypoints) && el?.type !== "label" && !!el?.businessObject && !String(el?.type || "").includes("Process"));
        if (!task) {
          task = modeling.createShape(
            elementFactory.createShape({ type: "bpmn:Task" }),
            { x: 360, y: 220 },
            root,
          );
        }
        modeling.updateLabel(task, label);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
    }, nextLabel);
    if (result.ok) break;
    await page.waitForTimeout(160);
  }
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function readXmlDraft(page) {
  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  return await xmlArea.inputValue();
}

test("E2E-1 immediate switch during import keeps pending save replay", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createSessionFixture(request, runId);
  await enableBpmnDebug(page, { importDelayMs: 900 });
  const telemetry = createTelemetry(page, fixture.sessionId);
  await openSession(page, fixture, { waitDiagram: false });

  await switchTab(page, "Interview");
  await switchTab(page, "Diagram");

  await expect
    .poll(() => getTagEntries(telemetry.logs, "SAVE_SKIPPED_NOT_READY").length)
    .toBeGreaterThan(0);
  await expect
    .poll(() => getTagEntries(telemetry.logs, "RUNTIME_READY").length)
    .toBeGreaterThan(0);
  await expect
    .poll(() => getTagEntries(telemetry.logs, "SAVE_EXECUTED").length)
    .toBeGreaterThan(0);
  await expect
    .poll(() => getTagEntries(telemetry.logs, "SAVE_PERSIST_DONE").length)
    .toBeGreaterThan(0);

  const readyTs = firstTagTs(telemetry.logs, "RUNTIME_READY");
  const saveExecutedTs = firstTagTs(telemetry.logs, "SAVE_EXECUTED", readyTs);
  expect(readyTs).toBeGreaterThan(0);
  expect(saveExecutedTs).toBeGreaterThanOrEqual(readyTs);

  const putAfterReady = telemetry.responses.find((entry) =>
    entry.ts >= readyTs
    && entry.method === "PUT"
    && entry.url.includes(`/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn`)
    && entry.status === 200);
  expect(putAfterReady).toBeTruthy();

  expectNoDefinitionsErrors(telemetry);
});

test("E2E-2 edit -> switch -> back keeps XML and revision monotonic", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createSessionFixture(request, runId);
  await enableBpmnDebug(page);
  const telemetry = createTelemetry(page, fixture.sessionId);
  await openSession(page, fixture, { waitDiagram: true });

  const startTs = Date.now();
  await mutateCreateRenameConnectDelete(page, "E2E-2");

  await switchTab(page, "Interview");
  await switchTab(page, "Diagram");
  const xmlAfterRoundtrip = await readXmlDraft(page);
  expect(xmlAfterRoundtrip).toContain("E2E-2 renamed");
  expect(xmlAfterRoundtrip).toContain("E2E-2 linked");
  expect(xmlAfterRoundtrip).not.toContain("E2E-2 to-delete");

  const saveRequestedRevs = telemetry.logs
    .filter((entry) => entry.ts >= startTs)
    .filter((entry) => parseBpmnTag(entry.text) === "SAVE_REQUESTED")
    .map((entry) => extractRevFromEntry(entry))
    .filter((x) => Number.isFinite(x));
  expect(saveRequestedRevs.length).toBeGreaterThan(0);

  const tabSwitchSave = telemetry.logs
    .filter((entry) => entry.ts >= startTs && parseBpmnTag(entry.text) === "SAVE_REQUESTED")
    .find((entry) => /\breason=tab_switch\b/.test(entry.text));
  expect(tabSwitchSave).toBeTruthy();
  const revAtSwitch = extractRevFromEntry(tabSwitchSave);
  expect(Number.isFinite(revAtSwitch)).toBeTruthy();

  const persistAfterSwitch = telemetry.logs.find(
    (entry) => entry.ts >= tabSwitchSave.ts && parseBpmnTag(entry.text) === "SAVE_PERSIST_DONE",
  );
  expect(persistAfterSwitch).toBeTruthy();

  const putAfterSwitch = telemetry.responses.find((entry) =>
    entry.ts >= tabSwitchSave.ts
    && entry.method === "PUT"
    && entry.url.includes(`/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn`)
    && entry.status === 200);
  expect(putAfterSwitch).toBeTruthy();
});

test("E2E-3 edit -> reload page restores latest XML and applies load", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createSessionFixture(request, runId);
  await enableBpmnDebug(page);
  const telemetry = createTelemetry(page, fixture.sessionId);
  await openSession(page, fixture, { waitDiagram: true });

  await mutateRenameOnly(page, "E2E-3 persisted label");
  await page.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => getTagEntries(telemetry.logs, "SAVE_PERSIST_DONE").length)
    .toBeGreaterThan(0);

  const beforeReloadLogsLen = telemetry.logs.length;
  const beforeReloadPersist = getTagEntries(telemetry.logs, "SAVE_PERSIST_DONE");
  const lastSavedRevBeforeReload = extractRevFromEntry(beforeReloadPersist[beforeReloadPersist.length - 1]) || 0;

  await page.reload({ waitUntil: "domcontentloaded" });
  await openSession(page, fixture, { waitDiagram: false, skipGoto: true });
  const xmlAfterReload = await readXmlDraft(page);
  expect(xmlAfterReload).toContain("E2E-3 persisted label");

  const afterReloadLogs = telemetry.logs.slice(beforeReloadLogsLen);
  const loadAppliedEntries = afterReloadLogs.filter((entry) => parseBpmnTag(entry.text) === "LOAD_APPLIED");
  expect(loadAppliedEntries.length).toBeGreaterThan(0);
  const appliedRev = extractAppliedRev(loadAppliedEntries[loadAppliedEntries.length - 1]);
  if (lastSavedRevBeforeReload > 0 && appliedRev > 0) {
    expect(appliedRev).toBeGreaterThanOrEqual(lastSavedRevBeforeReload);
  }
});

test("E2E-4 invalid XML apply does not break runtime and logs VALIDATION_FAIL", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createSessionFixture(request, runId);
  await enableBpmnDebug(page);
  const telemetry = createTelemetry(page, fixture.sessionId);
  await openSession(page, fixture, { waitDiagram: true });

  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  const invalidXml = "<bpmn:definitions><broken>";
  const beforeInvalidTs = Date.now();
  await xmlArea.fill(invalidXml);
  await page.getByRole("button", { name: "Сохранить XML" }).click();

  await expect(page.locator(".badge.err")).toContainText("XML");
  await expect
    .poll(() => getTagEntries(telemetry.logs, "VALIDATION_FAIL", beforeInvalidTs).length)
    .toBeGreaterThan(0);

  const saveExecutedAfterInvalid = getTagEntries(telemetry.logs, "SAVE_EXECUTED", beforeInvalidTs);
  expect(saveExecutedAfterInvalid.length).toBe(0);

  await page.getByRole("button", { name: "Сбросить" }).click();
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  const runtimeStillUsable = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return false;
    try {
      const canvas = modeler.get("canvas");
      return !!canvas && typeof canvas.zoom === "function";
    } catch {
      return false;
    }
  });
  expect(runtimeStillUsable).toBeTruthy();
  expectNoDefinitionsErrors(telemetry);
});

test("E2E-5 anti-rollback skips older revision load", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createSessionFixture(request, runId);
  await enableBpmnDebug(page);
  const telemetry = createTelemetry(page, fixture.sessionId);
  await openSession(page, fixture, { waitDiagram: true });

  const beforeMutateTs = Date.now();
  const revBumpResult = await page.evaluate(() => {
    const runtime = window.__FPC_E2E_RUNTIME__;
    const runtimeStatus = runtime?.getStatus?.() || null;
    const runtimeModeler = runtime?.getInstance?.();
    const modeler = (runtimeStatus?.ready && runtimeStatus?.defs && runtimeModeler)
      ? runtimeModeler
      : (window.__FPC_E2E_MODELER__ || runtimeModeler);
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const elementRegistry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const canvas = modeler.get("canvas");
      const root = canvas.getRootElement();
      const all = typeof elementRegistry.getAll === "function" ? elementRegistry.getAll() : [];
      let task = elementRegistry.get("Activity_1")
        || (elementRegistry.filter?.((el) => String(el?.type || "").endsWith("Task")) || [])[0]
        || all.find((el) => !Array.isArray(el?.waypoints) && el?.type !== "label" && !!el?.businessObject && !String(el?.type || "").includes("Process"));
      if (!task) {
        task = modeling.createShape(
          elementFactory.createShape({ type: "bpmn:Task" }),
          { x: 360, y: 220 },
          root,
        );
      }
      for (let i = 0; i < 6; i += 1) {
        modeling.updateLabel(task, `E2E-5 anti-rollback ${i}`);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(revBumpResult.ok, JSON.stringify(revBumpResult)).toBeTruthy();
  await expect
    .poll(() =>
      telemetry.logs.filter(
        (entry) =>
          entry.ts >= beforeMutateTs
          && parseBpmnTag(entry.text) === "STORE_UPDATED"
          && /\bsource=runtime_change\b/.test(entry.text),
      ).length)
    .toBeGreaterThan(0);

  const beforeResetTs = Date.now();
  await switchTab(page, "Diagram");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect
    .poll(() => {
      const older = getTagEntries(telemetry.logs, "LOAD_SKIPPED_OLDER_REV", beforeResetTs).length;
      const dirty = getTagEntries(telemetry.logs, "LOAD_SKIPPED_DIRTY_LOCAL", beforeResetTs).length;
      const applied = getTagEntries(telemetry.logs, "LOAD_APPLIED", beforeResetTs).length;
      return older + dirty + applied;
    })
    .toBeGreaterThan(0);

  const xmlAfterReset = await readXmlDraft(page);
  expect(xmlAfterReset).toContain("E2E-5 anti-rollback 5");
});
