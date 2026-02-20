import { chromium } from '@playwright/test';

const API = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:8011';
const APP = process.env.E2E_APP_BASE_URL || 'http://127.0.0.1:5177';

async function apiJson(res, op) {
  const txt = await res.text();
  if (!res.ok) throw new Error(`${op}: ${res.status} ${txt}`);
  return txt ? JSON.parse(txt) : {};
}

async function createProject(title) {
  const p = await apiJson(await fetch(`${API}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, passport: {} }),
  }), 'create project');
  return String(p.id || '');
}

async function switchTab(page, name) {
  const btn = page.locator('.segBtn').filter({ hasText: new RegExp(`^${name}`) }).first();
  await btn.click();
}

async function activeTab(page) {
  return await page.evaluate(() => {
    const btn = document.querySelector('.segBtn.active');
    return String(btn?.textContent || '').trim().toLowerCase();
  });
}

async function waitForSessionOptions(page) {
  return await page.evaluate(() => {
    return [...document.querySelectorAll('.topbar .topSelect--session option')]
      .map((o) => String(o.value || '').trim())
      .filter(Boolean);
  });
}

async function createSessionViaModal(page) {
  const before = await waitForSessionOptions(page);
  await page.getByRole('button', { name: 'Создать сессию' }).click();
  await page.getByRole('button', { name: 'Создать и начать интервью' }).click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Обновить' }).click();
  await page.waitForTimeout(350);
  const after = await waitForSessionOptions(page);
  const added = after.filter((sid) => !before.includes(sid));
  let sid = added[0] || '';
  if (!sid) {
    sid = await page.evaluate(() => String(document.querySelector('.topbar .topSelect--session')?.value || '').trim());
  }
  if (sid) {
    await page.selectOption('.topbar .topSelect--session', sid);
  }
  await page.waitForTimeout(250);
  return sid;
}

async function waitModeler(page) {
  await page.waitForFunction(() => !!window.__FPC_E2E_MODELER__, null, { timeout: 20000 });
}

async function createPoolLaneTask(page) {
  return await page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__;
    if (!m) return { ok: false, error: 'no_modeler' };
    try {
      const modeling = m.get('modeling');
      const ef = m.get('elementFactory');
      const canvas = m.get('canvas');
      const root = canvas.getRootElement();
      const participant = modeling.createShape(ef.createParticipantShape(), { x: 380, y: 240 }, root);
      try { modeling.addLane(participant, 'bottom'); } catch {}
      const task = modeling.createShape(ef.createShape({ type: 'bpmn:Task' }), { x: Number(participant.x || 0) + 260, y: Number(participant.y || 0) + 80 }, participant);
      modeling.updateLabel(task, 'R6 Task');
      return { ok: true, participantId: participant.id, taskId: task.id };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
}

async function probeDiagram(page) {
  return await page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__;
    if (!m) return { ok: false, reason: 'no_modeler' };
    const canvas = m.get('canvas');
    const reg = m.get('elementRegistry');
    const container = canvas?._container;
    const rect = container?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const svg = container?.querySelector?.('svg');
    const svgRect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const root = svg?.querySelector?.('g[class^="layer-root-"]') || svg?.querySelector?.('g.layer-root');
    let bbox = { width: 0, height: 0 };
    try { if (root && typeof root.getBBox === 'function') { const b = root.getBBox(); bbox = { width: Number(b?.width || 0), height: Number(b?.height || 0) }; } } catch {}
    const count = Array.isArray(reg?.getAll?.()) ? reg.getAll().length : 0;
    return {
      ok: true,
      reg: count,
      rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      svg: `${Math.round(svgRect.width)}x${Math.round(svgRect.height)}`,
      bbox: `${Math.round(bbox.width)}x${Math.round(bbox.height)}`,
    };
  });
}

(async () => {
  const projectId = await createProject(`R6 ${Date.now()}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const logs = [];
  const net = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (/(\[TAB_SET\]|\[TAB\]|\[SESSION\]|\[INTERVIEW_|\[BPMN_STORE_SET\]|\[ENSURE\]|\[STALE_GUARD\])/.test(t)) {
      logs.push(t);
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (/\/api\/sessions\//.test(url) || /recompute/.test(url)) {
      if (/(\/bpmn$|\/api\/sessions\/[^/]+$|recompute)/.test(url)) {
        net.push(`${res.request().method()} ${url.replace(API,'')} ${res.status()}`);
      }
    }
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem('fpc_debug_bpmn', '1');
    window.__FPC_E2E_DELAY_IMPORT_MS__ = 200;
  });

  await page.goto(APP);
  await page.waitForSelector('.topbar .topSelect--project');
  await page.selectOption('.topbar .topSelect--project', projectId);
  await page.getByRole('button', { name: 'Обновить' }).click();
  await page.waitForTimeout(300);

  const s1 = await createSessionViaModal(page);
  await switchTab(page, 'Diagram');
  await waitModeler(page);
  const createRes = await createPoolLaneTask(page);
  await page.waitForTimeout(500);
  await switchTab(page, 'Interview');
  await page.waitForTimeout(220);
  await switchTab(page, 'Diagram');
  await page.waitForTimeout(600);
  const r6aProbe = await probeDiagram(page);
  const r6aTab = await activeTab(page);

  const s2 = await createSessionViaModal(page);

  const hops = [];
  for (let i = 1; i <= 15; i += 1) {
    await page.selectOption('.topbar .topSelect--session', i % 2 === 0 ? s1 : s2);
    await page.waitForTimeout(120);
    await switchTab(page, 'Diagram');
    await page.waitForTimeout(180);
    const tab = await activeTab(page);
    const sid = await page.evaluate(() => String(document.querySelector('.topbar .topSelect--session')?.value || '').trim());
    hops.push({ i, sid, tab });
  }

  const interviewState = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.interviewTable input.input')].map((n) => String(n.value || '').trim()).filter(Boolean);
    return { count: inputs.length, sample: inputs.slice(0, 3) };
  }).catch(() => ({ count: 0, sample: [] }));

  console.log('R6_SUMMARY_START');
  console.log(`PROJECT=${projectId}`);
  console.log(`S1=${s1}`);
  console.log(`S2=${s2}`);
  console.log(`R6A_CREATE_OK=${createRes?.ok ? 1 : 0} err=${createRes?.error || '-'}`);
  console.log(`R6A_TAB=${r6aTab}`);
  console.log(`R6A_PROBE reg=${r6aProbe?.reg} rect=${r6aProbe?.rect} svg=${r6aProbe?.svg} bbox=${r6aProbe?.bbox}`);
  for (const h of hops) {
    console.log(`HOP i=${h.i} sid=${h.sid} activeTab=${h.tab}`);
  }
  console.log(`INTERVIEW_COUNT=${interviewState.count} SAMPLE=${interviewState.sample.join(' | ') || '-'}`);
  console.log('NETWORK_TAIL_START');
  for (const line of net.slice(-30)) console.log(line);
  console.log('NETWORK_TAIL_END');
  console.log('LOG_TAIL_START');
  for (const line of logs.slice(-80)) console.log(line);
  console.log('LOG_TAIL_END');
  console.log('R6_SUMMARY_END');

  await browser.close();
})();
