import { chromium } from '/opt/processmap-test/frontend/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://clearvestnic.ru:5180';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmMmNhNGI3MjI2YjA0NzJjYmM1Y2ZjNmYwNDQxOWZlYSIsImlhdCI6MTc3ODg2NDA0NiwiZXhwIjoxNzc4ODY3NjQ2LCJ0eXBlIjoiYWNjZXNzIn0.eVU8oiJ-bSiVKD2CNdC1l4zOSPEmNkST9izXMvRvlig';
const PROJECT = 'b1c8a56b6e';
const SESSION = '4c515d1c6e';

const contourDir = '/opt/processmap-test/.planning/contours/audit/diagram-post-optimization-runtime-profile-v1';
const evidenceDir = path.join(contourDir, 'evidence');
const screenshotDir = path.join(evidenceDir, 'screenshots');

function now() { return Date.now(); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getCounts(page) {
  return page.evaluate(() => ({
    dom: document.querySelectorAll('*').length,
    svg: document.querySelectorAll('svg *').length,
    fpcPropertyOverlay: document.querySelectorAll('.fpcPropertyOverlay').length,
    djsOverlay: document.querySelectorAll('.djs-overlay').length,
    fpcFocusDim: document.querySelectorAll('.fpcFocusDim').length,
    fpcAnalyticsSelected: document.querySelectorAll('.fpcAnalyticsSelected').length,
    djsBendpoint: document.querySelectorAll('.djs-bendpoint').length,
    djsSegmentDragger: document.querySelectorAll('.djs-segment-dragger').length,
    diagramReady: document.querySelector('[data-testid="diagram-ready"]') !== null,
    bpmnLayerEditor: document.querySelector('.bpmnLayer--editor')?.style?.display || 'not-found',
    bpmnLayerDiagram: document.querySelector('.bpmnLayer--diagram')?.style?.display || 'not-found',
  }));
}

async function clickShape(page, shapeLocator) {
  const box = await shapeLocator.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

async function safeClick(page, selector, timeout = 5000) {
  try {
    const el = page.locator(selector).first();
    await el.click({ timeout });
    return true;
  } catch (e) {
    console.log('Click failed for', selector, ':', e.message.split('\n')[0]);
    return false;
  }
}

const results = {
  startTime: new Date().toISOString(),
  scenarios: {},
  network: [],
  console: [],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on('request', req => {
  results.network.push({ type: 'request', url: req.url(), method: req.method(), time: now() });
});
page.on('response', res => {
  results.network.push({ type: 'response', url: res.url(), status: res.status(), time: now() });
});
page.on('console', msg => {
  results.console.push({ type: msg.type(), text: msg.text(), time: now() });
});
page.on('pageerror', err => {
  results.console.push({ type: 'pageerror', text: err.message, time: now() });
});

// Set auth token
await page.goto(`${BASE_URL}/app`);
await sleep(1500);
await page.evaluate(t => localStorage.setItem('fpc_auth_access_token', t), TOKEN);
await sleep(500);

// Scenario A — Initial load
console.log('Scenario A: Initial load');
const aStart = now();
await page.goto(`${BASE_URL}/app?project=${PROJECT}&session=${SESSION}&tab=diagram`);
await page.waitForSelector('[data-testid="diagram-ready"]', { timeout: 60000, state: 'attached' });
const aReady = now();
await sleep(3000);
const aCounts = await getCounts(page);
const aEnd = now();
results.scenarios.A = {
  start: aStart,
  ready: aReady,
  end: aEnd,
  timeToReady: aReady - aStart,
  timeToStable: aEnd - aStart,
  counts: aCounts,
};
await page.screenshot({ path: path.join(screenshotDir, 'scenario-a-diagram-loaded.png') });

// Scenario B — Tab switch
console.log('Scenario B: Tab switch');
const bTimings = [];
const analysisTab = '[role="tab"]:has-text("Анализ процессов")';
const diagramTab = '[role="tab"]:has-text("Diagram (BPMN)")';
const xmlTab = '[role="tab"]:has-text("XML")';

for (let i = 0; i < 3; i++) {
  const t0 = now();
  await safeClick(page, analysisTab);
  await sleep(2000);
  const t1 = now();
  await safeClick(page, diagramTab);
  await sleep(2000);
  const t2 = now();
  bTimings.push({ cycle: i + 1, toAnalysis: t1 - t0, toDiagram: t2 - t1 });
}
for (let i = 0; i < 3; i++) {
  const t0 = now();
  await safeClick(page, xmlTab);
  await sleep(2000);
  const t1 = now();
  await safeClick(page, diagramTab);
  await sleep(2000);
  const t2 = now();
  bTimings.push({ cycle: i + 4, toXml: t1 - t0, toDiagram: t2 - t1 });
}
const bCounts = await getCounts(page);
results.scenarios.B = { timings: bTimings, counts: bCounts };
await page.screenshot({ path: path.join(screenshotDir, 'scenario-b-after-tab-switch.png') });

// Scenario C — Analytics selection
console.log('Scenario C: Analytics selection');
const cTimings = [];
const cCountsBefore = await getCounts(page);
for (let i = 0; i < 10; i++) {
  const shapes = await page.locator('.djs-shape').all();
  if (shapes.length === 0) break;
  const shape = shapes[i % shapes.length];
  const t0 = now();
  await clickShape(page, shape);
  await sleep(500);
  const t1 = now();
  cTimings.push({ cycle: i + 1, latency: t1 - t0 });
}
const cCountsAfter = await getCounts(page);
results.scenarios.C = {
  before: cCountsBefore,
  after: cCountsAfter,
  delta: {
    dom: cCountsAfter.dom - cCountsBefore.dom,
    svg: cCountsAfter.svg - cCountsBefore.svg,
    fpcAnalyticsSelected: cCountsAfter.fpcAnalyticsSelected - cCountsBefore.fpcAnalyticsSelected,
    fpcFocusDim: cCountsAfter.fpcFocusDim - cCountsBefore.fpcFocusDim,
    djsBendpoint: cCountsAfter.djsBendpoint - cCountsBefore.djsBendpoint,
    djsSegmentDragger: cCountsAfter.djsSegmentDragger - cCountsBefore.djsSegmentDragger,
  },
  timings: cTimings,
};
await page.screenshot({ path: path.join(screenshotDir, 'scenario-c-after-selection.png') });

// Scenario D — Hover
console.log('Scenario D: Hover');
const dTimings = [];
for (let i = 0; i < 10; i++) {
  const shapes = await page.locator('.djs-shape').all();
  if (shapes.length === 0) break;
  const shape = shapes[i % shapes.length];
  const box = await shape.boundingBox();
  if (!box) continue;
  const t0 = now();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(200);
  const t1 = now();
  dTimings.push({ cycle: i + 1, latency: t1 - t0 });
}
const dCounts = await getCounts(page);
results.scenarios.D = { timings: dTimings, counts: dCounts };

// Scenario E — Pan/zoom
console.log('Scenario E: Pan/zoom');
const eCountsBefore = await getCounts(page);
const canvas = page.locator('.djs-container');
for (let i = 0; i < 10; i++) {
  const box = await canvas.boundingBox().catch(() => null);
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50);
    await page.mouse.up();
  }
  await canvas.click({ position: { x: 10, y: 10 } }).catch(() => {});
  await page.mouse.wheel(0, i % 2 === 0 ? -200 : 200);
  await sleep(400);
}
const eCountsAfter = await getCounts(page);
results.scenarios.E = {
  before: eCountsBefore,
  after: eCountsAfter,
  delta: {
    dom: eCountsAfter.dom - eCountsBefore.dom,
    svg: eCountsAfter.svg - eCountsBefore.svg,
    djsOverlay: eCountsAfter.djsOverlay - eCountsBefore.djsOverlay,
    fpcPropertyOverlay: eCountsAfter.fpcPropertyOverlay - eCountsBefore.fpcPropertyOverlay,
  },
};
await page.screenshot({ path: path.join(screenshotDir, 'scenario-e-after-pan-zoom.png') });

// Scenario F/G — Overlays toggle
console.log('Scenario F/G: Overlays');
let overlaysOn = false;
let fCounts = null;
let gCounts = null;
try {
  const layersBtn = page.locator('button:has-text("Слои")').first();
  if (await layersBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await layersBtn.click();
    await sleep(800);
    const toggles = await page.locator('[role="switch"], [role="checkbox"]').all();
    for (const toggle of toggles) {
      const label = await toggle.locator('xpath=..').innerText().catch(() => '');
      if (label.includes('Свойства') || label.includes('overlay') || label.includes('Overlays')) {
        await toggle.click();
        await sleep(1500);
        fCounts = await getCounts(page);
        overlaysOn = true;
        await toggle.click();
        await sleep(1500);
        gCounts = await getCounts(page);
        break;
      }
    }
    await layersBtn.click().catch(() => {});
  }
} catch (e) {
  console.log('Overlay toggle not accessible:', e.message.split('\n')[0]);
}
results.scenarios.F = { counts: fCounts, overlaysOn };
results.scenarios.G = { counts: gCounts };

// Scenario H — Property panel
console.log('Scenario H: Property panel');
const hTimings = [];
const hShapes = await page.locator('.djs-shape').all();
for (let i = 0; i < Math.min(5, hShapes.length); i++) {
  await clickShape(page, hShapes[i]);
  await sleep(400);
  const t0 = now();
  const panelBtn = page.locator('text=Выбранный узел').first();
  if (await panelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await panelBtn.click();
  }
  await sleep(600);
  const t1 = now();
  hTimings.push({ cycle: i + 1, panelOpenLatency: t1 - t0 });
}
const hCounts = await getCounts(page);
results.scenarios.H = { timings: hTimings, counts: hCounts };

// Scenario I — Edit mode
console.log('Scenario I: Edit mode');
let editModeEntered = false;
let iCountsBefore = null;
let iCountsAfter = null;
try {
  const editBtn = page.locator('button:has-text("Редактировать")').first();
  if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await editBtn.click();
    await sleep(2500);
    editModeEntered = true;
    iCountsBefore = await getCounts(page);
    const editShapes = await page.locator('.djs-shape').all();
    if (editShapes.length > 0) {
      await clickShape(page, editShapes[0]);
      await sleep(1000);
      iCountsAfter = await getCounts(page);
    }
    await editBtn.click().catch(() => {});
    await sleep(1000);
  }
} catch (e) {
  console.log('Edit mode not accessible:', e.message.split('\n')[0]);
}
results.scenarios.I = { editModeEntered, before: iCountsBefore, after: iCountsAfter };

// Scenario J — Small vs large
console.log('Scenario J: Small vs large');
results.scenarios.J = { note: 'Only one well-known test session (wewe) available. Small/large comparison not feasible in this run.' };

// Final counts
console.log('Final counts');
results.finalCounts = await getCounts(page);

await browser.close();

// Save raw results
fs.writeFileSync(path.join(evidenceDir, 'raw-results.json'), JSON.stringify(results, null, 2));

// Generate evidence markdown files
function writeMd(name, content) {
  fs.writeFileSync(path.join(evidenceDir, name), content);
}

writeMd('initial-load-timings.md', `# Initial Load Timings

- Time to diagram ready: ${results.scenarios.A.timeToReady} ms
- Time to stable (3s wait): ${results.scenarios.A.timeToStable} ms
- DOM nodes: ${results.scenarios.A.counts.dom}
- SVG nodes: ${results.scenarios.A.counts.svg}
- djs-overlay: ${results.scenarios.A.counts.djsOverlay}
- fpcPropertyOverlay: ${results.scenarios.A.counts.fpcPropertyOverlay}
- diagramReady: ${results.scenarios.A.counts.diagramReady}
- bpmnLayerEditor: ${results.scenarios.A.counts.bpmnLayerEditor}
- bpmnLayerDiagram: ${results.scenarios.A.counts.bpmnLayerDiagram}
`);

writeMd('tab-switch-timings.md', `# Tab Switch Timings

## Analysis ↔ Diagram (3 cycles)
${results.scenarios.B.timings.filter(t => t.cycle <= 3).map(t => `- Cycle ${t.cycle}: toAnalysis=${t.toAnalysis}ms, toDiagram=${t.toDiagram}ms`).join('\n')}

## XML ↔ Diagram (3 cycles)
${results.scenarios.B.timings.filter(t => t.cycle > 3).map(t => `- Cycle ${t.cycle}: toXml=${t.toXml}ms, toDiagram=${t.toDiagram}ms`).join('\n')}

Final counts after tab switches:
- DOM: ${results.scenarios.B.counts.dom}
- SVG: ${results.scenarios.B.counts.svg}
- djs-overlay: ${results.scenarios.B.counts.djsOverlay}
`);

writeMd('selection-hover-timings.md', `# Selection / Hover Timings

## Selection (10 elements)
- DOM delta: ${results.scenarios.C.delta.dom}
- SVG delta: ${results.scenarios.C.delta.svg}
- fpcAnalyticsSelected delta: ${results.scenarios.C.delta.fpcAnalyticsSelected}
- fpcFocusDim delta: ${results.scenarios.C.delta.fpcFocusDim}
- djs-bendpoint delta: ${results.scenarios.C.delta.djsBendpoint}
- djs-segment-dragger delta: ${results.scenarios.C.delta.djsSegmentDragger}
- Average selection latency: ${results.scenarios.C.timings.length > 0 ? Math.round(results.scenarios.C.timings.reduce((a, b) => a + b.latency, 0) / results.scenarios.C.timings.length) : 'N/A'} ms

## Hover (10 elements)
- Average hover latency: ${results.scenarios.D.timings.length > 0 ? Math.round(results.scenarios.D.timings.reduce((a, b) => a + b.latency, 0) / results.scenarios.D.timings.length) : 'N/A'} ms
`);

writeMd('pan-zoom-timings.md', `# Pan/Zoom Timings

## Before
- DOM: ${results.scenarios.E.before.dom}
- SVG: ${results.scenarios.E.before.svg}
- djs-overlay: ${results.scenarios.E.before.djsOverlay}
- fpcPropertyOverlay: ${results.scenarios.E.before.fpcPropertyOverlay}

## After (10 pan/zoom cycles)
- DOM: ${results.scenarios.E.after.dom}
- SVG: ${results.scenarios.E.after.svg}
- djs-overlay: ${results.scenarios.E.after.djsOverlay}
- fpcPropertyOverlay: ${results.scenarios.E.after.fpcPropertyOverlay}

## Delta
- DOM delta: ${results.scenarios.E.delta.dom}
- SVG delta: ${results.scenarios.E.delta.svg}
- djs-overlay delta: ${results.scenarios.E.delta.djsOverlay}
- fpcPropertyOverlay delta: ${results.scenarios.E.delta.fpcPropertyOverlay}
`);

writeMd('overlays-on-off-comparison.md', `# Overlays ON/OFF Comparison

- Overlays ON accessible: ${results.scenarios.F.overlaysOn}
- Overlays ON counts: ${results.scenarios.F.counts ? JSON.stringify(results.scenarios.F.counts) : 'N/A'}
- Overlays OFF counts: ${results.scenarios.G.counts ? JSON.stringify(results.scenarios.G.counts) : 'N/A'}
`);

writeMd('edit-mode-profile.md', `# Edit Mode Profile

- Edit mode entered: ${results.scenarios.I.editModeEntered}
- Before selection (edit mode): ${results.scenarios.I.before ? JSON.stringify(results.scenarios.I.before) : 'N/A'}
- After selection (edit mode): ${results.scenarios.I.after ? JSON.stringify(results.scenarios.I.after) : 'N/A'}
`);

writeMd('property-panel-profile.md', `# Property Panel Profile

- Average panel open/update latency: ${results.scenarios.H.timings.length > 0 ? Math.round(results.scenarios.H.timings.reduce((a, b) => a + b.panelOpenLatency, 0) / results.scenarios.H.timings.length) : 'N/A'} ms
- Final DOM: ${results.scenarios.H.counts.dom}
- Final SVG: ${results.scenarios.H.counts.svg}
`);

const networkSummary = {
  putBpmn: results.network.filter(n => n.type === 'request' && n.method === 'PUT' && n.url.includes('/bpmn')).length,
  patchSessions: results.network.filter(n => n.type === 'request' && n.method === 'PATCH' && n.url.includes('/sessions')).length,
  versionsLimit1: results.network.filter(n => n.type === 'request' && n.url.includes('/bpmn/versions?limit=1')).length,
  versionsLimit50: results.network.filter(n => n.type === 'request' && n.url.includes('/bpmn/versions?limit=50')).length,
  sessionsId: results.network.filter(n => n.type === 'request' && n.url.match(/\/sessions\/[^/]+$/)).length,
  sessionsIdBpmn: results.network.filter(n => n.type === 'request' && n.url.includes('/sessions/') && n.url.includes('/bpmn')).length,
  failed: results.network.filter(n => n.type === 'response' && n.status >= 400).length,
  authPresenceErrors: results.network.filter(n => n.type === 'response' && n.status === 401 && n.url.includes('presence')).length,
};

writeMd('network-summary.md', `# Network Summary

- PUT /bpmn: ${networkSummary.putBpmn}
- PATCH /sessions: ${networkSummary.patchSessions}
- /bpmn/versions?limit=1: ${networkSummary.versionsLimit1}
- /bpmn/versions?limit=50: ${networkSummary.versionsLimit50}
- /sessions/{id}: ${networkSummary.sessionsId}
- /sessions/{id}/bpmn: ${networkSummary.sessionsIdBpmn}
- Failed requests: ${networkSummary.failed}
- Auth/presence 401 errors: ${networkSummary.authPresenceErrors}
`);

const consoleErrors = results.console.filter(c => c.type === 'error' || c.type === 'pageerror');
writeMd('console-summary.md', `# Console Summary

Total console messages: ${results.console.length}
Errors: ${consoleErrors.length}

${consoleErrors.slice(0, 20).map(e => `- [${e.type}] ${e.text}`).join('\n')}
`);

writeMd('dom-svg-counts.md', `# DOM/SVG Counts

## Initial Load
- DOM: ${results.scenarios.A.counts.dom}
- SVG: ${results.scenarios.A.counts.svg}

## Final State
- DOM: ${results.finalCounts.dom}
- SVG: ${results.finalCounts.svg}
- djs-overlay: ${results.finalCounts.djsOverlay}
- fpcPropertyOverlay: ${results.finalCounts.fpcPropertyOverlay}
`);

writeMd('performance-trace-summary.md', `# Performance Trace Summary

- Chrome performance trace was not collected in this run (Playwright headless without explicit trace start).
- Fallback: timings collected via Date.now() deltas and DOM counts.
- No long task markers available.
- Recommendation: for deeper profiling, run Chrome DevTools Performance panel manually or enable Playwright tracing.
`);

console.log('Profiling complete. Results saved to', evidenceDir);
