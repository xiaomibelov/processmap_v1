// fix/canvas-move-di-desync-409-tracker — S1 e2e (локальный стек ветки).
// Кейсы: (a) одиночный drag Task_A реальной мышью → reload → waypoints
// инцидентных стрелок пристыкованы к server truth; (b) resize-down Task_A →
// reload → пристыкованы. Network-assert: payload POST /operations на drag —
// shape.move + element.updateDi (F1: раньше уходил только shape.move).
// Креды — только через env (STAGE_EMAIL/STAGE_PASSWORD/STAGE_APP_BASE/STAGE_API_BASE),
// в логи не попадают.
import { chromium } from "playwright";
import fs from "node:fs";
import {
  APP_BASE, API_BASE, apiLogin, createFixture, getBpmnXml,
  ACCESS_TOKEN_KEY, ACTIVE_ORG_KEY, CLIENT_ID_STORAGE_KEY,
} from "/Users/mac/agents_place/kimi_PM/.planning/contours/audit/c1-c2-stage-verification/lib.mjs";

const OUT = new URL(".", import.meta.url).pathname;
fs.mkdirSync(`${OUT}/logs`, { recursive: true });
fs.mkdirSync(`${OUT}/xml`, { recursive: true });
fs.mkdirSync(`${OUT}/shots`, { recursive: true });
const EV = `${OUT}/logs/s1-e2e-di-docking.jsonl`;
fs.writeFileSync(EV, "");
const ev = (o) => { console.log(JSON.stringify(o)); fs.appendFileSync(EV, JSON.stringify(o) + "\n"); };

ev({ event: "start", appBase: APP_BASE, apiBase: API_BASE });

const SEED = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_s1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_s1" isExecutable="false">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>F_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Task_A" name="A"><bpmn:incoming>F_1</bpmn:incoming><bpmn:outgoing>F_2</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="Task_B" name="B"><bpmn:incoming>F_2</bpmn:incoming><bpmn:outgoing>F_3</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="End_1"><bpmn:incoming>F_3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F_1" sourceRef="Start_1" targetRef="Task_A"/>
    <bpmn:sequenceFlow id="F_2" sourceRef="Task_A" targetRef="Task_B"/>
    <bpmn:sequenceFlow id="F_3" sourceRef="Task_B" targetRef="End_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Process_s1">
    <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1"><dc:Bounds x="172" y="182" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A"><dc:Bounds x="300" y="160" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B"><dc:Bounds x="540" y="160" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1"><dc:Bounds x="760" y="182" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="F_1_di" bpmnElement="F_1"><di:waypoint x="208" y="200"/><di:waypoint x="300" y="200"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F_2_di" bpmnElement="F_2"><di:waypoint x="420" y="200"/><di:waypoint x="540" y="200"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F_3_di" bpmnElement="F_3"><di:waypoint x="660" y="200"/><di:waypoint x="760" y="200"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Докинг: крайние waypoints у границ своих шейпов (не устарели относительно позиций).
function dockingReport(xml) {
  const shapes = {};
  const shapeRe = /<bpmndi:BPMNShape[^>]*bpmnElement="([^"]+)"[^>]*>[\s\S]*?<dc:Bounds x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g;
  let m;
  while ((m = shapeRe.exec(xml))) shapes[m[1]] = { x: +m[2], y: +m[3], w: +m[4], h: +m[5] };
  const flows = {};
  const flowRe = /<bpmn:sequenceFlow[^>]*id="([^"]+)"[^>]*sourceRef="([^"]+)"[^>]*targetRef="([^"]+)"/g;
  while ((m = flowRe.exec(xml))) flows[m[1]] = { source: m[2], target: m[3] };
  const edges = {};
  const edgeRe = /<bpmndi:BPMNEdge[^>]*bpmnElement="([^"]+)"[^>]*>([\s\S]*?)<\/bpmndi:BPMNEdge>/g;
  while ((m = edgeRe.exec(xml))) {
    edges[m[1]] = [...m[2].matchAll(/<di:waypoint x="([-\d.]+)" y="([-\d.]+)"\s*\/?>/g)].map((w) => ({ x: +w[1], y: +w[2] }));
  }
  const report = {};
  for (const [fid, refs] of Object.entries(flows)) {
    const wps = edges[fid];
    const s = shapes[refs.source];
    const t = shapes[refs.target];
    if (!wps || wps.length < 2 || !s || !t) continue;
    const near = (p, r) => p.x >= r.x - 10 && p.x <= r.x + r.w + 10 && p.y >= r.y - 10 && p.y <= r.y + r.h + 10;
    report[fid] = {
      startDocked: near(wps[0], s),
      endDocked: near(wps[wps.length - 1], t),
      startWp: wps[0], endWp: wps[wps.length - 1],
    };
  }
  return report;
}

const dockedAll = (report) => Object.values(report).every((r) => r.startDocked && r.endDocked);

const run = async () => {
  const auth = await apiLogin();
  const fixture = await createFixture(auth, `s1-${Date.now().toString(36)}`, SEED);
  const sid = fixture.sessionId;
  ev({ event: "fixture", sessionId: sid, projectId: fixture.projectId });
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: APP_BASE, viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(() => {
    window.__NET__ = { opsBodies: [], putCount: 0 };
    const orig = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input?.url;
      const method = String((init?.method || input?.method || "GET")).toUpperCase();
      if (/\/operations(\?|$)/.test(String(url)) && method === "POST") {
        let body = null;
        try { body = JSON.parse(await new Response(init?.body).text()); } catch { /* noop */ }
        window.__NET__.opsBodies.push({ operations: (body?.operations || []).map((o) => o.type) });
      }
      if (/\/bpmn(\?|$)/.test(String(url)) && method === "PUT") window.__NET__.putCount += 1;
      return orig(input, init);
    };
  });
  await context.addInitScript(({ tokenKey, token, orgKey, orgId, cidKey, cid }) => {
    window.localStorage.setItem(tokenKey, token);
    if (orgId) window.localStorage.setItem(orgKey, orgId);
    window.sessionStorage.setItem(cidKey, cid);
  }, {
    tokenKey: ACCESS_TOKEN_KEY, token: auth.token,
    orgKey: ACTIVE_ORG_KEY, orgId: auth.activeOrgId,
    cidKey: CLIENT_ID_STORAGE_KEY, cid: `s1-${Date.now().toString(36)}`,
  });
  const page = await context.newPage();
  const openSession = async () => {
    await page.goto(`/app?${new URLSearchParams({ project: fixture.projectId, session: sid }).toString()}`);
    await page.waitForFunction(() => {
      const m = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      return !!m && !!m.get("elementRegistry").get("Task_A");
    }, null, { timeout: 120_000 });
  };
  await openSession();

  // Диагностика: фиксируем дескрипторы notifyChange (что видит outbox).
  await page.evaluate(() => {
    window.__CHANGES__ = [];
    const rt = window.__FPC_E2E_RUNTIME__;
    if (rt?.onChange) {
      rt.onChange((ev) => {
        if (ev?.type === "commandStack.changed") {
          window.__CHANGES__.push({
            command: ev.command,
            action: ev.action,
            hasAffected: Array.isArray(ev.commandContext?.affectedConnections),
            affectedIds: Array.isArray(ev.commandContext?.affectedConnections)
              ? ev.commandContext.affectedConnections.map((c) => `${c.id}:${(c.waypoints || []).length}`) : null,
            ctxKeys: Object.keys(ev.commandContext || {}),
          });
        }
      });
    }
  });

  const focusElement = async (id) => page.evaluate((id) => {
    const m = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = m.get("canvas");
    const el = m.get("elementRegistry").get(id);
    const host = document.querySelector(".bpmnStageHost").getBoundingClientRect();
    const vb = canvas.viewbox();
    canvas.viewbox({
      x: (el.x + el.width / 2) - (700 - host.left) / vb.scale,
      y: (el.y + el.height / 2) - (500 - host.top) / vb.scale,
      width: vb.width, height: vb.height,
    });
    const gfx = canvas.getGraphics(el);
    const r = gfx.getBoundingClientRect();
    let px = 0; let py = 0; let hitId = null;
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.25], [0.25, 0.3], [0.3, 0.7]]) {
      px = Math.round((r.x + r.width * fx) * 10) / 10;
      py = Math.round((r.y + r.height * fy) * 10) / 10;
      const hit = document.elementFromPoint(px, py);
      hitId = hit?.closest?.("[data-element-id]")?.getAttribute("data-element-id") || null;
      if (hitId === id) break;
    }
    return { px, py, hitId };
  }, id);

  const mouseDrag = async (from, dx, dy) => {
    await page.mouse.move(from.px, from.py);
    await page.mouse.down();
    for (let step = 1; step <= 8; step += 1) {
      await page.mouse.move(from.px + (dx * step) / 8, from.py + (dy * step) / 8 + (step % 2 ? 2 : -2));
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  };

  // === Кейс (a): одиночный drag Task_A реальной мышью ===
  await page.evaluate(() => { window.__NET__.opsBodies = []; });
  const fa = await focusElement("Task_A");
  ev({ event: "case-a-focus", ...fa });
  await page.waitForTimeout(200);
  await mouseDrag(fa, 160, 120);
  await page.waitForTimeout(5000); // drag-final debounce + ops-flush
  const netA = await page.evaluate(() => window.__NET__);
  const changesA = await page.evaluate(() => window.__CHANGES__);
  ev({ event: "case-a-changes", changes: changesA });
  const opsTypesA = netA.opsBodies.flatMap((b) => b.operations);
  const afterA = await getBpmnXml(auth, sid); // server truth ДО snapshot-restore
  const reportA = dockingReport(afterA);
  fs.writeFileSync(`${OUT}/xml/a-after-single-drag.xml`, afterA);
  await page.reload({ waitUntil: "domcontentloaded" });
  await openSession();
  const afterReloadA = await getBpmnXml(auth, sid);
  const reportA2 = dockingReport(afterReloadA);
  const caseA = {
    event: "case-a-single-drag",
    opsTypes: opsTypesA,
    updateDiCount: opsTypesA.filter((t) => t === "element.updateDi").length,
    putCount: netA.putCount,
    dockedBeforeRestore: dockedAll(reportA),
    dockedAfterReload: dockedAll(reportA2),
    reportBefore: reportA,
    reportAfter: reportA2,
  };
  ev(caseA);
  await page.screenshot({ path: `${OUT}/shots/a-after-single-drag.png` });

  // === Кейс (b): resize-down Task_A (реальная мышь по resize-handle se) ===
  await page.evaluate(() => { window.__NET__.opsBodies = []; });
  const fb = await focusElement("Task_A");
  await page.mouse.click(fb.px, fb.py);
  await page.waitForTimeout(300);
  const handle = await page.evaluate(() => {
    // Кастомные резайзеры приложения: .djs-resizer.djs-resizer-<id>.djs-resizer-{n,w,s,e}
    const hit = document.querySelector(".djs-resizer.djs-resizer-Task_A.djs-resizer-s .djs-resizer-hit")
      || document.querySelector(".djs-resizer.djs-resizer-Task_A.djs-resizer-s");
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { px: r.x + r.width / 2, py: r.y + r.height / 2, cls: hit.getAttribute("class") };
  });
  ev({ event: "case-b-handle", ...handle });
  if (!handle) throw new Error("resize-handle not found");
  await mouseDrag(handle, 0, -30); // resize-down: нижняя грань вверх, высота минус 30
  await page.waitForTimeout(5000);
  const netB = await page.evaluate(() => window.__NET__);
  const opsTypesB = netB.opsBodies.flatMap((b) => b.operations);
  const afterB = await getBpmnXml(auth, sid);
  const reportB = dockingReport(afterB);
  fs.writeFileSync(`${OUT}/xml/b-after-resize-down.xml`, afterB);
  await page.reload({ waitUntil: "domcontentloaded" });
  await openSession();
  const afterReloadB = await getBpmnXml(auth, sid);
  const reportB2 = dockingReport(afterReloadB);
  const caseB = {
    event: "case-b-resize-down",
    opsTypes: opsTypesB,
    updateDiCount: opsTypesB.filter((t) => t === "element.updateDi").length,
    putCount: netB.putCount,
    dockedBeforeRestore: dockedAll(reportB),
    dockedAfterReload: dockedAll(reportB2),
    reportBefore: reportB,
    reportAfter: reportB2,
  };
  ev(caseB);
  await page.screenshot({ path: `${OUT}/shots/b-after-resize-down.png` });

  const verdict = {
    event: "VERDICT",
    caseA_pass: caseA.updateDiCount > 0 && caseA.dockedBeforeRestore && caseA.dockedAfterReload,
    caseB_pass: caseB.updateDiCount > 0 && caseB.dockedBeforeRestore && caseB.dockedAfterReload,
  };
  verdict.pass = verdict.caseA_pass && verdict.caseB_pass;
  ev(verdict);

  await browser.close();
  if (!verdict.pass) process.exit(1);
};

run().catch((e) => {
  ev({ event: "ERROR", message: String(e?.message || e) });
  process.exit(1);
});
