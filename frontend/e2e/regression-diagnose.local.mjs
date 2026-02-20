import { chromium } from '@playwright/test';

const API = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:8011';
const APP = process.env.E2E_APP_BASE_URL || 'http://127.0.0.1:5177';

function seedBpmnXml(processName = 'REG diag process') {
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

async function apiJson(res, op) {
  const txt = await res.text();
  if (!res.ok) throw new Error(`${op}: ${res.status} ${txt}`);
  return txt ? JSON.parse(txt) : {};
}

async function switchTab(page, title) {
  const btn = page.locator('.segBtn').filter({ hasText: new RegExp(`^${title}`) }).first();
  await btn.click();
}

async function createFixture(runId) {
  const p = await apiJson(await fetch(`${API}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: `REG project ${runId}`, passport: {} }),
  }), 'create project');
  const projectId = String(p.id || '');

  const s = await apiJson(await fetch(`${API}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: `REG session ${runId}`, roles: ['Повар 1', 'Повар 2'], start_role: 'Повар 1' }),
  }), 'create session');
  const sessionId = String(s.id || s.session_id || '');

  await apiJson(await fetch(`${API}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ xml: seedBpmnXml(`REG process ${runId}`) }),
  }), 'put bpmn');

  return { projectId, sessionId };
}

function shortNode(n) {
  if (!n) return '-';
  const t = String(n.tagName || '').toLowerCase();
  const id = String(n.id || '').trim();
  const cls = String(n.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.');
  return `${t}${id ? '#' + id : ''}${cls ? '.' + cls : ''}`;
}

(async () => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createFixture(runId);

  const browser = await chromium.launch({ headless: true });
  const vw = Number(process.env.E2E_VIEWPORT_W || 1366);
  const vh = Number(process.env.E2E_VIEWPORT_H || 860);
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });

  const net = [];
  page.on('requestfinished', (req) => {
    const url = req.url();
    if (!url.includes('/api/')) return;
    net.push(`${req.method()} ${url.replace(API, '')}`);
  });

  await page.goto(APP);
  await page.waitForSelector('.topbar .topSelect--project');
  await page.selectOption('.topbar .topSelect--project', fixture.projectId);
  await page.getByRole('button', { name: 'Обновить' }).click();
  await page.waitForFunction((sid) => {
    return !!document.querySelector(`.topbar .topSelect--session option[value="${sid}"]`);
  }, fixture.sessionId, { timeout: 30000 });
  await page.selectOption('.topbar .topSelect--session', fixture.sessionId);
  await switchTab(page, 'Diagram');
  await page.waitForFunction(() => !!window.__FPC_E2E_MODELER__, null, { timeout: 20000 });

  const layoutBefore = await page.evaluate(() => {
    function rect(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return {
      topbar: rect('.topbar'),
      processHeader: rect('.processHeader'),
      processBody: rect('.processBody'),
      seg: rect('.seg'),
      bpmnHost: rect('.bpmnStageHost'),
      bpmnTools: rect('.bpmnCanvasTools'),
    };
  });

  await page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__;
    if (!m) return;
    const reg = m.get('elementRegistry');
    const modeling = m.get('modeling');
    const ef = m.get('elementFactory');
    const task = reg.get('Activity_1') || (reg.filter?.((el) => String(el?.type || '').endsWith('Task')) || [])[0];
    if (!task) return;
    modeling.updateLabel(task, 'REG task label changed');
    modeling.createShape(ef.createShape({ type: 'bpmn:Task' }), { x: Number(task.x || 0) + 260, y: Number(task.y || 0) + 40 }, task.parent);
  });
  await page.waitForTimeout(400);

  const controls = [
    { name: 'Save', selector: '.processSaveBtn', text: '' },
    { name: 'Import BPMN', selector: 'button', text: 'Import BPMN' },
    { name: 'Export BPMN', selector: 'button', text: 'Export BPMN' },
    { name: 'Reset', selector: 'button', text: 'Reset' },
    { name: 'Clear', selector: 'button', text: 'Clear' },
    { name: 'Tab Interview', selector: '.segBtn', text: 'Interview' },
    { name: 'Tab Diagram', selector: '.segBtn', text: 'Diagram' },
    { name: 'Tab XML', selector: '.segBtn', text: 'XML' },
  ];

  const clickDiag = [];
  for (const c of controls) {
    const result = await page.evaluate(({ selector, text, name }) => {
      const all = [...document.querySelectorAll(selector)];
      const el = text
        ? all.find((n) => String(n.textContent || '').trim() === text)
        : all[0];
      if (!el) return { name, selector, found: false };
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const style = window.getComputedStyle(el);
      const topStyle = top ? window.getComputedStyle(top) : null;
      let chain = [];
      let p = top;
      for (let i = 0; i < 4 && p; i += 1) {
        const s = window.getComputedStyle(p);
        chain.push(`${p.tagName.toLowerCase()}#${p.id || '-'}.${String(p.className || '').split(/\s+/).slice(0,3).join('.')} pe=${s.pointerEvents} z=${s.zIndex} pos=${s.position} op=${s.opacity} vis=${s.visibility}`);
        p = p.parentElement;
      }
      return {
        name,
        selector,
        found: true,
        disabled: !!el.disabled,
        rect: `${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)}`,
        target: `${el.tagName.toLowerCase()}#${el.id || '-'}.${String(el.className || '').split(/\s+/).slice(0,4).join('.')}`,
        targetPe: style.pointerEvents,
        targetZ: style.zIndex,
        top: top ? `${top.tagName.toLowerCase()}#${top.id || '-'}.${String(top.className || '').split(/\s+/).slice(0,4).join('.')}` : '-',
        topPe: topStyle?.pointerEvents || '-',
        topZ: topStyle?.zIndex || '-',
        blocked: !!top && top !== el && !el.contains(top),
        chain,
      };
    }, c);

    const before = net.length;
    let clickOk = true;
    let clickErr = '';
    try {
      const loc = c.text
        ? page.locator(c.selector).filter({ hasText: new RegExp(`^${c.text}$`) }).first()
        : page.locator(c.selector).first();
      await loc.click({ timeout: 3000 });
      await page.waitForTimeout(250);
    } catch (e) {
      clickOk = false;
      clickErr = String(e?.message || e);
    }
    const after = net.length;

    clickDiag.push({ ...result, clickOk, clickErr, netDelta: after - before, netTail: net.slice(Math.max(0, after - 3), after) });
  }

  await switchTab(page, 'Interview');
  await page.waitForTimeout(300);
  await switchTab(page, 'Diagram');
  await page.waitForTimeout(700);

  const probeInterviewBack = await page.evaluate(() => {
    const host = document.querySelector('.bpmnStageHost');
    const rect = host?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const djs = host?.querySelector?.('.djs-container');
    const djsRect = djs?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const svg = host?.querySelector?.('svg');
    const svgRect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const viewport = svg?.querySelector?.('g.viewport') || svg?.querySelector?.('g.djs-viewport');
    const vpRect = viewport?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const reg = window.__FPC_E2E_MODELER__?.get?.('elementRegistry');
    return {
      host: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      djs: `${Math.round(djsRect.width)}x${Math.round(djsRect.height)}`,
      svg: `${Math.round(svgRect.width)}x${Math.round(svgRect.height)}`,
      viewport: `${Math.round(vpRect.width)}x${Math.round(vpRect.height)}`,
      reg: Array.isArray(reg?.getAll?.()) ? reg.getAll().length : -1,
    };
  });

  await switchTab(page, 'XML');
  await page.waitForTimeout(300);
  await switchTab(page, 'Diagram');
  await page.waitForTimeout(700);

  const probeXmlBack = await page.evaluate(() => {
    const host = document.querySelector('.bpmnStageHost');
    const rect = host?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const djs = host?.querySelector?.('.djs-container');
    const djsRect = djs?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const svg = host?.querySelector?.('svg');
    const svgRect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const viewport = svg?.querySelector?.('g.viewport') || svg?.querySelector?.('g.djs-viewport');
    const vpRect = viewport?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const reg = window.__FPC_E2E_MODELER__?.get?.('elementRegistry');
    return {
      host: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      djs: `${Math.round(djsRect.width)}x${Math.round(djsRect.height)}`,
      svg: `${Math.round(svgRect.width)}x${Math.round(svgRect.height)}`,
      viewport: `${Math.round(vpRect.width)}x${Math.round(vpRect.height)}`,
      reg: Array.isArray(reg?.getAll?.()) ? reg.getAll().length : -1,
    };
  });

  console.log('REG_DIAG_START');
  console.log(`project=${fixture.projectId} session=${fixture.sessionId} viewport=${vw}x${vh}`);
  console.log(`LAYOUT before topbar=${JSON.stringify(layoutBefore.topbar)} processHeader=${JSON.stringify(layoutBefore.processHeader)} processBody=${JSON.stringify(layoutBefore.processBody)} seg=${JSON.stringify(layoutBefore.seg)} bpmnHost=${JSON.stringify(layoutBefore.bpmnHost)} bpmnTools=${JSON.stringify(layoutBefore.bpmnTools)}`);
  for (const row of clickDiag) {
    console.log(`CLICK name=${row.name} found=${row.found ? 1 : 0} disabled=${row.disabled ? 1 : 0} blocked=${row.blocked ? 1 : 0} clickOk=${row.clickOk ? 1 : 0} netDelta=${row.netDelta} target=${row.target || '-'} top=${row.top || '-'} targetPe=${row.targetPe || '-'} topPe=${row.topPe || '-'} rect=${row.rect || '-'} err=${(row.clickErr || '-').replace(/\s+/g, ' ').slice(0, 140)}`);
    if (row.chain?.length) {
      for (const ch of row.chain) console.log(`  CHAIN ${row.name} :: ${ch}`);
    }
    if (row.netTail?.length) {
      for (const n of row.netTail) console.log(`  NET ${row.name} :: ${n}`);
    }
  }
  console.log(`PROBE interview_back host=${probeInterviewBack.host} djs=${probeInterviewBack.djs} svg=${probeInterviewBack.svg} vp=${probeInterviewBack.viewport} reg=${probeInterviewBack.reg}`);
  console.log(`PROBE xml_back host=${probeXmlBack.host} djs=${probeXmlBack.djs} svg=${probeXmlBack.svg} vp=${probeXmlBack.viewport} reg=${probeXmlBack.reg}`);
  console.log('REG_DIAG_END');

  await browser.close();
})();
