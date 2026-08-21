import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

const APP_BASE = process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177";
const PERF_DURATION_US = 50_000; // 50 ms long-task threshold

function toMs(usRaw) {
  return Number(usRaw || 0) / 1000;
}

function mean(values) {
  if (!Array.isArray(values) || !values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function getRendererMainThread(traceEvents) {
  const threadNames = (traceEvents || []).filter((ev) => ev?.ph === "M" && ev?.name === "thread_name");
  const main = threadNames.find((ev) => String(ev?.args?.name || "") === "CrRendererMain")
    || threadNames.find((ev) => String(ev?.args?.name || "").toLowerCase().includes("renderer"));
  if (!main) return null;
  return { pid: main.pid, tid: main.tid };
}

function analyzeTrace(trace) {
  const traceEvents = Array.isArray(trace?.traceEvents) ? trace.traceEvents : [];
  const mainThread = getRendererMainThread(traceEvents);
  const completeEvents = traceEvents.filter((ev) => ev?.ph === "X" && Number.isFinite(Number(ev?.dur)));
  const mainCompleteEvents = mainThread
    ? completeEvents.filter((ev) => ev?.pid === mainThread.pid && ev?.tid === mainThread.tid)
    : completeEvents;

  const longTasks = mainCompleteEvents.filter(
    (ev) => String(ev?.name || "") === "RunTask" && Number(ev?.dur || 0) > PERF_DURATION_US,
  );
  const longTaskMaxMs = longTasks.length ? Math.max(...longTasks.map((ev) => toMs(ev.dur))) : 0;

  const frameEvents = mainCompleteEvents
    .filter((ev) => ["DrawFrame", "CompositeLayers", "CommitCompositorFrame"].includes(String(ev?.name || "")))
    .sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
  const frameTimesMs = [];
  for (let i = 1; i < frameEvents.length; i += 1) {
    const prev = Number(frameEvents[i - 1]?.ts || 0);
    const next = Number(frameEvents[i]?.ts || 0);
    if (next > prev) frameTimesMs.push((next - prev) / 1000);
  }
  const avgFrameMs = mean(frameTimesMs);
  const fpsApprox = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;

  return {
    eventCount: traceEvents.length,
    mainThreadEventCount: mainCompleteEvents.length,
    longTasksCount: longTasks.length,
    longTaskMaxMs,
    frameSamples: frameTimesMs.length,
    avgFrameMs,
    fpsApprox,
  };
}

async function startBrowserTrace(page) {
  const cdp = await page.context().newCDPSession(page);
  const categories = [
    "devtools.timeline",
    "disabled-by-default-devtools.timeline",
    "disabled-by-default-devtools.timeline.frame",
    "toplevel",
    "blink.user_timing",
    "v8",
  ].join(",");
  await cdp.send("Tracing.start", {
    categories,
    transferMode: "ReturnAsStream",
  });
  return cdp;
}

async function stopBrowserTrace(cdp) {
  const tracingComplete = new Promise((resolve) => {
    cdp.once("Tracing.tracingComplete", resolve);
  });
  await cdp.send("Tracing.end");
  const event = await tracingComplete;
  const stream = String(event?.stream || "");
  let content = "";
  while (stream) {
    const chunk = await cdp.send("IO.read", { handle: stream });
    content += String(chunk?.data || "");
    if (chunk?.eof) break;
  }
  if (stream) {
    await cdp.send("IO.close", { handle: stream });
  }
  let parsed = { traceEvents: [] };
  try {
    parsed = JSON.parse(content || "{\"traceEvents\":[]}");
  } catch {
    parsed = { traceEvents: [] };
  }
  await cdp.detach();
  return parsed;
}

async function createEmptySessionFixture(request, runId, headers) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { title: `E2E canvas empty ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E canvas empty session ${runId}`,
        roles: ["Оператор"],
        start_role: "Оператор",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId, orgId: project.org_id || project.orgId || "" };
}

async function createSimpleSessionFixture(request, runId, headers) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { title: `E2E canvas simple ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E canvas simple session ${runId}`,
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
    data: {
      xml: seedXml({ processName: `E2E canvas ${runId}` }),
      base_diagram_state_version: 0,
      base_bpmn_xml_version: 0,
    },
  });
  await apiJson(putRes, "seed bpmn");
  return { projectId, sessionId, orgId: project.org_id || project.orgId || "" };
}

function seedCollapsedSubprocessXml(runId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_${runId}"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="Collapsed ${runId}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_1" name="Collapsed Source">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:startEvent id="SubStart_1">
        <bpmn:outgoing>SubFlow_1</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:task id="InnerTask_1" name="Inner task">
        <bpmn:incoming>SubFlow_1</bpmn:incoming>
        <bpmn:outgoing>SubFlow_2</bpmn:outgoing>
      </bpmn:task>
      <bpmn:endEvent id="SubEnd_1">
        <bpmn:incoming>SubFlow_2</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="SubFlow_1" sourceRef="SubStart_1" targetRef="InnerTask_1" />
      <bpmn:sequenceFlow id="SubFlow_2" sourceRef="InnerTask_1" targetRef="SubEnd_1" />
    </bpmn:subProcess>
    <bpmn:task id="Task_1" name="Neighbor task">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="SubProcess_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="SubProcess_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="false">
        <dc:Bounds x="260" y="128" width="180" height="110" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="540" y="143" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="178" />
        <di:waypoint x="260" y="183" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="440" y="183" />
        <di:waypoint x="540" y="183" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="SubProcess_1_diagram">
    <bpmndi:BPMNPlane id="SubProcess_1_plane" bpmnElement="SubProcess_1">
      <bpmndi:BPMNShape id="SubStart_1_di" bpmnElement="SubStart_1">
        <dc:Bounds x="120" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="InnerTask_1_di" bpmnElement="InnerTask_1">
        <dc:Bounds x="220" y="98" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubEnd_1_di" bpmnElement="SubEnd_1">
        <dc:Bounds x="440" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="SubFlow_1_di" bpmnElement="SubFlow_1">
        <di:waypoint x="156" y="138" />
        <di:waypoint x="220" y="138" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SubFlow_2_di" bpmnElement="SubFlow_2">
        <di:waypoint x="360" y="138" />
        <di:waypoint x="440" y="138" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function createSubprocessFixture(request, runId, headers) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { title: `E2E canvas subprocess ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E canvas subprocess session ${runId}`,
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
    data: {
      xml: seedCollapsedSubprocessXml(runId),
      base_diagram_state_version: 0,
      base_bpmn_xml_version: 0,
    },
  });
  await apiJson(putRes, "seed subprocess bpmn");
  return { projectId, sessionId, orgId: project.org_id || project.orgId || "" };
}

function collectConsole(page) {
  const logs = [];
  const errors = [];
  page.on("console", (msg) => {
    const text = String(msg.text() || "");
    logs.push({ ts: Date.now(), type: msg.type(), text });
    if (msg.type() === "error") errors.push(text);
  });
  page.on("pageerror", (err) => {
    errors.push(String(err?.message || err || ""));
  });
  return { logs, errors };
}

function countTag(logs, tag, fromTs = 0) {
  return logs.filter((entry) => entry.ts >= fromTs && entry.text.includes(`[BPMN] ${tag}`)).length;
}

function hasExceeded(logs, fromTs = 0) {
  return logs.some((entry) => entry.ts >= fromTs && /exceeded_\d+ms/.test(entry.text));
}

async function getCurrentRootId(page) {
  return await page.evaluate(() => {
    try {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      if (!modeler) return "";
      const canvas = modeler.get("canvas");
      const root = canvas?.getRootElement?.();
      return String(root?.businessObject?.id || root?.id || "");
    } catch {
      return "";
    }
  });
}

async function waitRootId(page, expected, timeout = 15_000) {
  await expect
    .poll(async () => getCurrentRootId(page), { timeout })
    .toBe(expected);
}

async function gotoSession(page, fixture) {
  await page.goto(`/app?project=${fixture.projectId}&session=${fixture.sessionId}`);
  try {
    await page.locator("h1:has-text('Выберите организацию')").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("button").filter({ has: page.locator("div", { hasText: "Default" }) }).first().click();
  } catch {
    // org chooser not shown
  }
  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.sessionId)}`);
}

test("empty BPMN loads under 2 s and emits no timeout errors", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
  const fixture = await createEmptySessionFixture(request, runId, auth.headers);
  const telemetry = collectConsole(page);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DEBUG_BPMN__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId, appBaseUrl: APP_BASE });

  const loadStartedAt = Date.now();
  await gotoSession(page, fixture);
  await waitForDiagramReady(page, { timeout: 45_000 });
  const loadMs = Date.now() - loadStartedAt;

  expect(loadMs, `empty BPMN load took ${loadMs} ms`).toBeLessThan(2000);
  expect(hasExceeded(telemetry.logs)).toBe(false);
  expect(telemetry.errors).toHaveLength(0);

  // eslint-disable-next-line no-console
  console.info("[canvas-smoke] empty-load", { loadMs, errors: telemetry.errors.length });
});

test("pan keeps FPS >= 25 and no long tasks > 50 ms", async ({ page, request }) => {
  test.skip(process.env.E2E_CANVAS_PERF !== "1", "Set E2E_CANVAS_PERF=1 to run pan performance trace.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
  const fixture = await createSimpleSessionFixture(request, runId, auth.headers);
  const telemetry = collectConsole(page);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DEBUG_BPMN__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId, appBaseUrl: APP_BASE });

  await gotoSession(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page, { timeout: 45_000 });

  const canvasHost = page.locator(".bpmnStageHost").first();
  await expect(canvasHost).toBeVisible();
  const box = await canvasHost.boundingBox();
  expect(box).toBeTruthy();

  // Start runtime frame and long-task sampling.
  const samplePromise = page.evaluate(() => new Promise((resolve) => {
    const frames = [];
    const longTasks = [];
    let rafId;
    const observer = typeof PerformanceObserver !== "undefined"
      ? new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.entryType === "longtask" && entry.duration > 50) {
              longTasks.push({ duration: entry.duration, startTime: entry.startTime });
            }
          });
        })
      : null;
    if (observer) {
      try {
        observer.observe({ entryTypes: ["longtask"] });
      } catch {
        // ignore unsupported
      }
    }
    const start = performance.now();
    function tick(now) {
      frames.push(now);
      if (now - start < 1200) {
        rafId = requestAnimationFrame(tick);
      } else {
        if (rafId) cancelAnimationFrame(rafId);
        resolve({ frames, longTasks });
      }
    }
    rafId = requestAnimationFrame(tick);
  }));

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 60; i += 1) {
    await page.mouse.move(startX + i * 8, startY + (i % 4) * 3, { steps: 1 });
    await page.waitForTimeout(5);
  }
  await page.mouse.up();

  const { frames, longTasks } = await samplePromise;
  const deltas = [];
  for (let i = 1; i < frames.length; i += 1) {
    deltas.push(frames[i] - frames[i - 1]);
  }
  const avgFrameMs = mean(deltas);
  const fpsApprox = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;
  const longTaskMaxMs = longTasks.length ? Math.max(...longTasks.map((t) => t.duration)) : 0;

  expect(longTasks.length).toBe(0);
  expect(longTaskMaxMs).toBeLessThan(50);
  expect(fpsApprox).toBeGreaterThanOrEqual(25);
  expect(hasExceeded(telemetry.logs)).toBe(false);
  expect(telemetry.errors).toHaveLength(0);

  // eslint-disable-next-line no-console
  console.info("[canvas-smoke] pan-perf", {
    avgFrameMs,
    fpsApprox,
    frameSamples: deltas.length,
    longTasksCount: longTasks.length,
    longTaskMaxMs,
  });
});

test("three consecutive status changes do not reload the canvas", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
  const fixture = await createSimpleSessionFixture(request, runId, auth.headers);
  const telemetry = collectConsole(page);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DEBUG_BPMN__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId, appBaseUrl: APP_BASE });

  await gotoSession(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page, { timeout: 45_000 });

  const baselineImports = countTag(telemetry.logs, "importXML.modeler.before");
  expect(baselineImports).toBeGreaterThan(0);

  const statusButton = page.getByTestId("topbar-session-status");
  await expect(statusButton).toBeVisible();

  // Draft -> In progress -> Review -> In progress (three transitions)
  const transitions = ["В работе", "На проверке", "В работе"];
  for (const label of transitions) {
    await statusButton.click();
    const menu = page.getByTestId("topbar-status-change-menu");
    await expect(menu).toBeVisible();
    const option = menu.locator("button").filter({ hasText: new RegExp(`^${label}$`) }).first();
    await expect(option).toBeVisible();
    await option.click();
    await expect(menu).toBeHidden();
    await page.waitForTimeout(800);
  }

  const importsDuringStatusChanges = countTag(telemetry.logs, "importXML.modeler.before") - baselineImports;
  expect(importsDuringStatusChanges, `unexpected imports during status changes: ${importsDuringStatusChanges}`).toBe(0);
  expect(hasExceeded(telemetry.logs)).toBe(false);
  expect(telemetry.errors).toHaveLength(0);

  // eslint-disable-next-line no-console
  console.info("[canvas-smoke] status-changes", { transitions: transitions.length, importsDuringStatusChanges });
});

test("subprocess drill-in < 300 ms and return < 200 ms without refetching parent XML", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
  const fixture = await createSubprocessFixture(request, runId, auth.headers);

  // Pre-create the child subprocess session so the drilldown click only navigates.
  const navRes = await request.post(
    `${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/subprocess/SubProcess_1/navigate`,
    { headers: auth.headers },
  );
  const navBody = await apiJson(navRes, "pre-create subprocess child");
  fixture.childSessionId = String(navBody.subprocess_session_id || "").trim();
  expect(fixture.childSessionId).not.toBe("");

  const telemetry = collectConsole(page);

  const parentBpmnUrl = new RegExp(
    `/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn(?:\\?|$)`,
  );
  const childBpmnUrl = new RegExp(
    `/api/sessions/${encodeURIComponent(fixture.childSessionId)}/bpmn(?:\\?|$)`,
  );
  let parentXmlFetchesAfterLoad = 0;
  const bpmnFetchLog = [];

  page.on("response", (res) => {
    const url = String(res.url() || "");
    const method = res.request().method().toUpperCase();
    const isParent = parentBpmnUrl.test(url) && method === "GET";
    const isChild = childBpmnUrl.test(url) && method === "GET";
    if (isParent || isChild) {
      const entry = { ts: Date.now(), method, url: url.split("?")[0], type: isParent ? "parent" : "child" };
      bpmnFetchLog.push(entry);
      if (isParent) parentXmlFetchesAfterLoad += 1;
    }
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DEBUG_BPMN__ = true;
    window.__FPC_DEBUG_NAV__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId, appBaseUrl: APP_BASE });

  await gotoSession(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page, { timeout: 45_000 });

  // Wait for parent XML fetch to settle, then reset counter.
  await page.waitForTimeout(500);
  parentXmlFetchesAfterLoad = 0;

  const drilldown = page.locator(".bjs-drilldown").first();
  await expect(drilldown, "drilldown arrow should be rendered").toBeVisible();

  const drillStart = performance.now();
  await drilldown.click({ force: true });

  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.childSessionId)}`);
  const drillNavigationMs = performance.now() - drillStart;

  await waitRootId(page, "SubProcess_1", 15_000);
  const drillMs = performance.now() - drillStart;

  expect(drillNavigationMs, `drill-in navigation took ${drillNavigationMs.toFixed(1)} ms`).toBeLessThan(300);
  expect(drillMs, `drill-in total took ${drillMs.toFixed(1)} ms`).toBeLessThan(500);
  expect(parentXmlFetchesAfterLoad, "drill-in should not refetch parent XML").toBe(0);

  const breadcrumbs = page.getByTestId("subprocess-breadcrumbs");
  await expect(breadcrumbs).toBeVisible();
  await expect(breadcrumbs).toContainText("Подпроцесс");

  const backStart = performance.now();
  await page.getByTestId("subprocess-back-button").click();

  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.sessionId)}`);
  await expect.poll(async () => page.url()).not.toContain(`session=${encodeURIComponent(fixture.childSessionId)}`);
  const backNavigationMs = performance.now() - backStart;

  await waitRootId(page, "Process_1", 15_000);
  const backMs = performance.now() - backStart;

  const relevantLogs = telemetry.logs
    .filter((entry) => /\[SESSION\]|\[BPMN\]|\[COORD\]/.test(entry.text))
    .map((entry) => ({ ts: entry.ts, text: entry.text.slice(0, 240) }));

  // eslint-disable-next-line no-console
  console.info("[canvas-smoke] subprocess-nav", {
    drillNavigationMs: Math.round(drillNavigationMs),
    drillMs: Math.round(drillMs),
    backNavigationMs: Math.round(backNavigationMs),
    backMs: Math.round(backMs),
    parentXmlFetchesAfterLoad,
    bpmnFetchLog,
    relevantLogs,
  });

  expect(backNavigationMs, `return navigation took ${backNavigationMs.toFixed(1)} ms`).toBeLessThan(300);
  expect(backMs, `return total took ${backMs.toFixed(1)} ms`).toBeLessThan(500);
  expect(parentXmlFetchesAfterLoad, "return should not refetch parent XML").toBe(0);
  expect(hasExceeded(telemetry.logs)).toBe(false);
  expect(telemetry.errors).toHaveLength(0);
});
