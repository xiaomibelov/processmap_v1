import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "../..");

const BASE_URL = process.env.TEST_BASE_URL || "http://clearvestnic.ru:5177";
const EMAIL = process.env.TEST_EMAIL || "admin@local";
const PASSWORD = process.env.TEST_PASSWORD || "admin";
const PROJECT_ID = process.env.TEST_PROJECT_ID || "0715811eb7";
const ELEMENT_COUNT = Number(process.env.ELEMENT_COUNT || 200);
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(REPO_ROOT, ".planning/contours/audit/v2-overlay-performance");

function buildBpmnXml(count) {
  const taskSpacingX = 180;
  const taskSpacingY = 120;
  let tasks = "";
  let flows = "";
  let shapes = "";
  let edges = "";
  const cols = 10;

  tasks += `    <bpmn:startEvent id="StartEvent_1" />\n`;
  shapes += `      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1"><dc:Bounds x="80" y="80" width="36" height="36" /></bpmndi:BPMNShape>\n`;

  let prevId = "StartEvent_1";
  let prevX = 80;
  let prevY = 80;

  for (let i = 1; i <= count; i += 1) {
    const id = `Task_${i}`;
    const col = (i - 1) % cols;
    const row = Math.floor((i - 1) / cols);
    const x = 200 + col * taskSpacingX;
    const y = 80 + row * taskSpacingY;
    const hasProp = i % 2 === 1;
    const camundaBlock = hasProp
      ? `\n      <bpmn:extensionElements>\n        <camunda:properties>\n          <camunda:property name="prop_${i}" value="value_${i}" />\n        </camunda:properties>\n      </bpmn:extensionElements>`
      : "";
    tasks += `    <bpmn:task id="${id}" name="Task ${i}">${camundaBlock}\n    </bpmn:task>\n`;
    flows += `    <bpmn:sequenceFlow id="Flow_${i}" sourceRef="${prevId}" targetRef="${id}" />\n`;
    shapes += `      <bpmndi:BPMNShape id="_BPMNShape_${id}" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="100" height="80" /></bpmndi:BPMNShape>\n`;
    edges += `      <bpmndi:BPMNEdge id="Flow_${i}_di" bpmnElement="Flow_${i}"><di:waypoint x="${prevX + (prevId.startsWith("Start") ? 36 : 100)}" y="${prevY + (prevId.startsWith("Start") ? 36 : 80) / 2}" /><di:waypoint x="${x}" y="${y + 40}" /></bpmndi:BPMNEdge>\n`;
    prevId = id;
    prevX = x;
    prevY = y;
  }

  const endId = "EndEvent_1";
  const endX = prevX + 180;
  const endY = prevY + 30;
  tasks += `    <bpmn:endEvent id="${endId}" />\n`;
  flows += `    <bpmn:sequenceFlow id="Flow_End" sourceRef="${prevId}" targetRef="${endId}" />\n`;
  shapes += `      <bpmndi:BPMNShape id="_BPMNShape_${endId}" bpmnElement="${endId}"><dc:Bounds x="${endX}" y="${endY}" width="36" height="36" /></bpmndi:BPMNShape>\n`;
  edges += `      <bpmndi:BPMNEdge id="Flow_End_di" bpmnElement="Flow_End"><di:waypoint x="${prevX + 100}" y="${prevY + 40}" /><di:waypoint x="${endX}" y="${endY + 18}" /></bpmndi:BPMNEdge>\n`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_perf" isExecutable="false">
${tasks}${flows}  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Diagram">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_perf">
${shapes}${edges}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function continuousPan(page, centerX, centerY, durationMs = 5000) {
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < durationMs) {
    const angle = i * 0.4;
    const radius = 100;
    await page.mouse.move(
      Math.round(centerX + Math.cos(angle) * radius),
      Math.round(centerY + Math.sin(angle) * radius),
    );
    await page.waitForTimeout(16);
    i += 1;
  }
  await page.mouse.up();
}

async function continuousWheel(page, centerX, centerY, durationMs = 5000) {
  await page.mouse.move(centerX, centerY);
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < durationMs) {
    await page.mouse.wheel(0, i % 2 === 0 ? -20 : 20);
    await page.waitForTimeout(16);
    i += 1;
  }
}

async function ensureSidebarOpen(page) {
  const handle = page.locator('[data-testid="left-sidebar-handle"]');
  if (await handle.isVisible().catch(() => false)) {
    await handle.locator(".leftSidebarHandleOpenBtn").first().click();
    await page.waitForTimeout(400);
  }
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app/, { timeout: 15000 });
  try {
    await page.waitForSelector('h1:has-text("Выберите организацию")', { timeout: 5000 });
    await page.click('button:has-text("Default")');
    await page.waitForURL(/\/app/, { timeout: 15000 });
  } catch {
    // no org screen
  }
}

async function createSessionWithBpmn(page) {
  const accessToken = await page.evaluate(() => localStorage.getItem("fpc_auth_access_token") || "");
  const createRes = await page.evaluate(
    async ({ projectId, token, count }) => {
      const res = await fetch(`/api/projects/${projectId}/sessions?mode=quick_skeleton`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: `V2 overlay perf ${count} ${Math.random().toString(36).slice(2, 8)}` }),
      });
      return res.json();
    },
    { projectId: PROJECT_ID, token: accessToken, count: ELEMENT_COUNT },
  );
  const sessionId = createRes?.session?.id || createRes?.id;
  if (!sessionId) throw new Error(`session create failed: ${JSON.stringify(createRes)}`);

  const xml = buildBpmnXml(ELEMENT_COUNT);
  const sessionBefore = await page.evaluate(
    async ({ sid, token }) => {
      const res = await fetch(`/api/sessions/${sid}`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json();
    },
    { sid: sessionId, token: accessToken },
  );
  const baseVersion = sessionBefore?.diagram_state_version ?? sessionBefore?.bpmn_xml_version ?? 0;
  const putRes = await page.evaluate(
    async ({ sid, xml: bodyXml, token, version }) => {
      const res = await fetch(`/api/sessions/${sid}/bpmn`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ xml: bodyXml, base_diagram_state_version: version }),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    { sid: sessionId, xml, token: accessToken, version: baseVersion },
  );
  if (putRes.status >= 400) throw new Error(`BPMN PUT failed: ${putRes.status} ${JSON.stringify(putRes.body)}`);
  return { sessionId, xml };
}

async function measureFps(page, actionPromise, label, durationMs = 5000) {
  const fpsPromise = page.evaluate(
    (ms) => new Promise((resolve) => {
      const frames = [];
      const start = performance.now();
      let rafId;
      const tick = (t) => {
        frames.push(t);
        if (t - start < ms) {
          rafId = requestAnimationFrame(tick);
        } else {
          cancelAnimationFrame(rafId);
          const deltas = [];
          for (let i = 1; i < frames.length; i += 1) deltas.push(frames[i] - frames[i - 1]);
          const avgDelta = deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1);
          resolve({
            frames: frames.length,
            duration: t - start,
            avgDelta,
            avgFps: 1000 / avgDelta,
            minFps: 1000 / Math.max(...deltas, 1),
            maxDelta: Math.max(...deltas, 0),
          });
        }
      };
      requestAnimationFrame(tick);
    }),
    durationMs,
  );
  await actionPromise;
  return { label, ...(await fpsPromise) };
}

async function run() {
  console.log(`[perf] starting browser for ${BASE_URL}, elements=${ELEMENT_COUNT}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("console", (msg) => console.log(`[console ${msg.type()}]`, msg.text()));

  await login(page);
  const { sessionId } = await createSessionWithBpmn(page);
  await page.goto(`${BASE_URL}/app?project=${PROJECT_ID}&session=${sessionId}`);
  await page.waitForSelector(".bpmnStageHost", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await ensureSidebarOpen(page);

  // Fit the diagram so the viewport covers the whole BPMN plane. Without this
  // the sidebar can leave the canvas zoomed in and viewport culling will only
  // mount the small visible subset of overlays, making the benchmark numbers
  // unrepresentative of the full 200-overlay load.
  const fitBtn = page.locator('[data-testid="diagram-zoom-fit"]');
  if (await fitBtn.isVisible().catch(() => false)) {
    await fitBtn.click();
    await page.waitForTimeout(800);
    console.log("[perf] fit-to-viewport clicked");
  }

  // Baseline: overlays OFF
  const host = page.locator(".bpmnStageHost");
  const box = await host.boundingBox();
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  const baselinePan = await measureFps(
    page,
    continuousPan(page, centerX, centerY),
    "pan_overlays_off",
  );
  console.log("[perf] baseline pan:", baselinePan);

  // Select an element so the properties accordion and V2 toggles are rendered.
  // Use force: true because the diagram toolbar can overlap the first rows.
  const task = page.locator('[data-element-id="Task_1"]');
  await task.click({ force: true });
  await page.waitForTimeout(400);

  // Expand the "Свойства" accordion where V2 toggles live.
  const propertiesHead = page.locator('.sidebarAccordionHead').filter({ hasText: "Свойства" });
  if (await propertiesHead.isVisible().catch(() => false)) {
    if ((await propertiesHead.getAttribute("aria-expanded")) !== "true") {
      await propertiesHead.click();
      await page.waitForTimeout(300);
    }
  }

  // Enable V2 overlays via its checkbox test id for reliable state change.
  const v2Checkbox = page.locator('[data-testid="bpmn-show-v2-overlays-checkbox"]');
  if (await v2Checkbox.isVisible().catch(() => false)) {
    if (!(await v2Checkbox.isChecked())) {
      await v2Checkbox.check();
      await page.waitForTimeout(1500);
    }
  } else {
    console.warn("[perf] V2 overlay checkbox not found");
  }

  const overlayCount = await page.evaluate(() => document.querySelectorAll(".fpc-overlay-v2-host").length);
  console.log("[perf] V2 overlay hosts visible:", overlayCount);

  // Force overlays to stay visible during pan/zoom so the expensive per-overlay
  // visibility pass is not skipped by the pan performance patch.
  const panOverlayBtn = page.locator('button[title="Скрывать оверлеи при перемещении/зуме для производительности"]');
  if (await panOverlayBtn.isVisible().catch(() => false)) {
    await panOverlayBtn.click();
    await page.waitForTimeout(300);
    console.log("[perf] enabled show-overlays-during-pan");
  }

  const v2Pan = await measureFps(
    page,
    continuousPan(page, centerX, centerY),
    "pan_v2_on",
  );
  console.log("[perf] V2 pan:", v2Pan);

  // Drag a task (force to bypass palette hit areas)
  const v2Drag = await measureFps(
    page,
    (async () => {
      await task.dragTo(task, {
        sourcePosition: { x: 20, y: 20 },
        targetPosition: { x: 140, y: 100 },
        timeout: 5000,
        force: true,
      });
    })(),
    "drag_task_v2_on",
  );
  console.log("[perf] V2 drag:", v2Drag);

  // Scroll zoom
  const v2Scroll = await measureFps(
    page,
    continuousWheel(page, centerX, centerY),
    "scroll_zoom_v2_on",
  );
  console.log("[perf] V2 scroll:", v2Scroll);

  // Expand all V2 overlays to stress the most expensive configuration.
  const v2ExpandCheckbox = page.locator('[data-testid="bpmn-show-v2-overlays-expanded-checkbox"]');
  let expandedCount = overlayCount;
  let expandedMeasurements = [];
  if (await v2ExpandCheckbox.isVisible().catch(() => false)) {
    if (!(await v2ExpandCheckbox.isChecked())) {
      await v2ExpandCheckbox.check();
      await page.waitForTimeout(1500);
    }
    expandedCount = await page.evaluate(() => document.querySelectorAll(".fpc-overlay-v2-host").length);
    console.log("[perf] V2 expanded overlay hosts visible:", expandedCount);

    const v2ExpandedPan = await measureFps(
      page,
      continuousPan(page, centerX, centerY),
      "pan_v2_expanded",
    );
    console.log("[perf] V2 expanded pan:", v2ExpandedPan);

    const v2ExpandedDrag = await measureFps(
      page,
      (async () => {
        await task.dragTo(task, {
          sourcePosition: { x: 20, y: 20 },
          targetPosition: { x: 140, y: 100 },
          timeout: 5000,
          force: true,
        });
      })(),
      "drag_task_v2_expanded",
    );
    console.log("[perf] V2 expanded drag:", v2ExpandedDrag);

    const v2ExpandedScroll = await measureFps(
      page,
      continuousWheel(page, centerX, centerY),
      "scroll_zoom_v2_expanded",
    );
    console.log("[perf] V2 expanded scroll:", v2ExpandedScroll);
    expandedMeasurements = [v2ExpandedPan, v2ExpandedDrag, v2ExpandedScroll];
  }

  await browser.close();

  const report = {
    url: `${BASE_URL}/app?project=${PROJECT_ID}&session=${sessionId}`,
    elementCount: ELEMENT_COUNT,
    overlayCount,
    expandedCount,
    measurements: [baselinePan, v2Pan, v2Drag, v2Scroll, ...expandedMeasurements],
  };

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const outPath = path.join(ARTIFACT_DIR, "fps_measurements.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("[perf] report saved to", outPath);
}

run().catch((err) => {
  console.error("[perf] FAILED", err);
  process.exit(1);
});
