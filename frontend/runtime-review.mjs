import { chromium } from 'playwright';

const BASE_URL = 'http://clearvestnic.ru:5180';
const SESSION_URL = `${BASE_URL}/app?project=b1c8a56b6e&session=4c515d1c6e`;
const CB = Date.now();

const results = {
  timestamp: new Date().toISOString(),
  url: `${SESSION_URL}&cb=${CB}`,
  checks: {}
};

function log(label, data) {
  console.log(`\n=== ${label} ===`);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

// Collect network requests
const networkRequests = [];
page.on('request', req => {
  const url = req.url();
  if (url.includes('/bpmn') || url.includes('/sessions') || req.method() === 'PUT' || req.method() === 'PATCH') {
    networkRequests.push({ method: req.method(), url: url.replace(/\?cb=\d+/, '?cb=<ts>') });
  }
});

// Collect console messages
const consoleMessages = [];
page.on('console', msg => {
  const text = msg.text();
  if (msg.type() === 'error' || msg.type() === 'warning' || text.includes('Conflict') || text.includes('409')) {
    consoleMessages.push({ type: msg.type(), text: text.slice(0, 200) });
  }
});

// Collect long tasks
await page.addInitScript(() => {
  window.__longTasks = [];
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      window.__longTasks.push({
        duration: entry.duration,
        startTime: entry.startTime,
        name: entry.name
      });
    }
  });
  observer.observe({ entryTypes: ['longtask'] });
});

function getLongTasks() {
  const tasks = window.__longTasks;
  window.__longTasks = [];
  return tasks;
}

function measureLongTasks(page, durationMs) {
  return new Promise(resolve => {
    setTimeout(async () => {
      const tasks = await page.evaluate(getLongTasks);
      resolve(tasks);
    }, durationMs);
  });
}

// 1. Fresh load and basic checks
console.log('Navigating to cache-busted URL...');
const response = await page.goto(`${SESSION_URL}&cb=${CB}`, { waitUntil: 'networkidle' });
results.checks.httpStatus = response.status();
results.checks.cacheHeaders = response.headers()['cache-control'] || 'missing';

await page.waitForTimeout(3000);

// Version / build info / marker
const versionChecks = await page.evaluate(() => ({
  buildInfo: window.__PROCESSMAP_BUILD_INFO__ || null,
  versionInFooter: document.body.innerText.includes('v1.0.130'),
  versionBadgeCount: document.querySelectorAll('[data-testid="diagram-runtime-version-badge"]').length,
  markerOnCanvas: !!document.querySelector('.djs-container [data-testid="diagram-runtime-version-badge"]')
}));
results.checks.version = versionChecks;
log('Version / Build Info / Marker', versionChecks);

// Diagram state
const diagramState = await page.evaluate(() => ({
  djsContainers: document.querySelectorAll('.djs-container').length,
  svgNodes: document.querySelectorAll('svg *').length,
  bpmnShapes: document.querySelectorAll('.djs-shape').length,
  fpcOverlays: document.querySelectorAll('.fpcPropertyOverlay').length,
  djsOverlays: document.querySelectorAll('.djs-overlay').length,
  totalElements: document.querySelectorAll('*').length
}));
results.checks.diagramState = diagramState;
log('Diagram State', diagramState);

// 2. Idle baseline (10s)
console.log('Measuring idle baseline for 10s...');
const idleTasks = await measureLongTasks(page, 10000);
results.checks.idleBaseline = {
  longTaskCount: idleTasks.length,
  totalBlockedMs: idleTasks.reduce((s, t) => s + t.duration, 0),
  maxTaskMs: idleTasks.length ? Math.max(...idleTasks.map(t => t.duration)) : 0
};
log('Idle Baseline (10s)', results.checks.idleBaseline);

// Clear tasks before drag
await page.evaluate(() => { window.__longTasks = []; });

// 3. Quick canvas drag (3 attempts)
async function doQuickDrag(page) {
  const canvas = await page.$('.djs-container');
  if (!canvas) throw new Error('Canvas not found');
  const box = await canvas.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 200, startY + 100, { steps: 1 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const tasks = await page.evaluate(getLongTasks);
  return tasks;
}

const quickDragResults = [];
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => { window.__longTasks = []; });
  const tasks = await doQuickDrag(page);
  quickDragResults.push({
    attempt: i + 1,
    count: tasks.length,
    totalMs: tasks.reduce((s, t) => s + t.duration, 0),
    maxMs: tasks.length ? Math.max(...tasks.map(t => t.duration)) : 0
  });
  await page.waitForTimeout(500);
}
quickDragResults.sort((a, b) => a.count - b.count);
results.checks.quickDrag = {
  attempts: quickDragResults,
  median: quickDragResults[1]
};
log('Quick Canvas Drag', results.checks.quickDrag);

// 4. Stepped canvas drag (3 attempts)
async function doSteppedDrag(page) {
  const canvas = await page.$('.djs-container');
  if (!canvas) throw new Error('Canvas not found');
  const box = await canvas.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 300, startY + 150, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const tasks = await page.evaluate(getLongTasks);
  return tasks;
}

const steppedDragResults = [];
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => { window.__longTasks = []; });
  const tasks = await doSteppedDrag(page);
  steppedDragResults.push({
    attempt: i + 1,
    count: tasks.length,
    totalMs: tasks.reduce((s, t) => s + t.duration, 0),
    maxMs: tasks.length ? Math.max(...tasks.map(t => t.duration)) : 0
  });
  await page.waitForTimeout(500);
}
steppedDragResults.sort((a, b) => a.count - b.count);
results.checks.steppedDrag = {
  attempts: steppedDragResults,
  median: steppedDragResults[1]
};
log('Stepped Canvas Drag', results.checks.steppedDrag);

// 5. Element drag (3 attempts)
async function doElementDrag(page) {
  const shape = await page.$('.djs-shape');
  if (!shape) throw new Error('No BPMN shape found');
  const box = await shape.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 50, startY + 50, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const tasks = await page.evaluate(getLongTasks);
  return tasks;
}

const elementDragResults = [];
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => { window.__longTasks = []; });
  const tasks = await doElementDrag(page);
  elementDragResults.push({
    attempt: i + 1,
    count: tasks.length,
    totalMs: tasks.reduce((s, t) => s + t.duration, 0),
    maxMs: tasks.length ? Math.max(...tasks.map(t => t.duration)) : 0
  });
  await page.waitForTimeout(500);
}
elementDragResults.sort((a, b) => a.count - b.count);
results.checks.elementDrag = {
  attempts: elementDragResults,
  median: elementDragResults[1]
};
log('Element Drag', results.checks.elementDrag);

// 6. Tab switch
await page.evaluate(() => { window.__longTasks = []; });
const xmlTab = await page.$('text=XML');
if (xmlTab) await xmlTab.click();
await page.waitForTimeout(1000);
const diagramTab = await page.$('text=Диаграмма');
if (diagramTab) await diagramTab.click();
await page.waitForTimeout(2000);
const tabSwitchTasks = await page.evaluate(getLongTasks);
results.checks.tabSwitch = {
  longTaskCount: tabSwitchTasks.length,
  totalBlockedMs: tabSwitchTasks.reduce((s, t) => s + t.duration, 0),
  maxTaskMs: tabSwitchTasks.length ? Math.max(...tabSwitchTasks.map(t => t.duration)) : 0
};
log('Tab Switch (Diagram -> XML -> Diagram)', results.checks.tabSwitch);

// 7. Network safety
results.checks.networkSafety = {
  requests: networkRequests,
  putDuringPan: networkRequests.filter(r => r.method === 'PUT' && r.url.includes('/bpmn')).length,
  patchDuringPan: networkRequests.filter(r => r.method === 'PATCH' && r.url.includes('/sessions')).length,
  versionsSpam: networkRequests.filter(r => r.url.includes('/versions')).length
};
log('Network Safety', results.checks.networkSafety);

// 8. Console errors
results.checks.console = {
  messages: consoleMessages.slice(0, 20),
  errorCount: consoleMessages.filter(m => m.type === 'error').length
};
log('Console Messages (errors/warnings)', results.checks.console);

// Summary
log('RESULTS JSON', results);

await browser.close();
process.exit(0);
