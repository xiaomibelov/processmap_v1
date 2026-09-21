// fix/canvas-move-di-desync-409-tracker — S4 e2e (локальный стек ветки).
// F3: reconnect стрелки реальной мышью на новый endpoint → reload → DI-edge
// маршрут у новых endpoints (server truth), 0 PUT /bpmn, ≥1 POST /operations.
// Креды — только через env, в логи не попадают.
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
const EV = `${OUT}/logs/s4-e2e-reconnect-di.jsonl`;
fs.writeFileSync(EV, "");
const ev = (o) => { console.log(JSON.stringify(o)); fs.appendFileSync(EV, JSON.stringify(o) + "\n"); };

ev({ event: "start", appBase: APP_BASE, apiBase: API_BASE });

// Start → Task_A → Task_B → End; Task_C — свободная цель для reconnect.
const SEED = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_s4" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_s4" isExecutable="false">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>F_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Task_A" name="A"><bpmn:incoming>F_1</bpmn:incoming><bpmn:outgoing>F_2</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="Task_B" name="B"><bpmn:incoming>F_2</bpmn:incoming><bpmn:outgoing>F_3</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="Task_C" name="C"/>
    <bpmn:endEvent id="End_1"><bpmn:incoming>F_3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F_1" sourceRef="Start_1" targetRef="Task_A"/>
    <bpmn:sequenceFlow id="F_2" sourceRef="Task_A" targetRef="Task_B"/>
    <bpmn:sequenceFlow id="F_3" sourceRef="Task_B" targetRef="End_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Process_s4">
    <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1"><dc:Bounds x="172" y="182" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A"><dc:Bounds x="300" y="160" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B"><dc:Bounds x="540" y="160" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_C_di" bpmnElement="Task_C"><dc:Bounds x="540" y="360" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1"><dc:Bounds x="780" y="182" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="F_1_di" bpmnElement="F_1"><di:waypoint x="208" y="200"/><di:waypoint x="300" y="200"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F_2_di" bpmnElement="F_2"><di:waypoint x="420" y="200"/><di:waypoint x="540" y="200"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F_3_di" bpmnElement="F_3"><di:waypoint x="660" y="200"/><di:waypoint x="780" y="200"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Отчёт по маршруту DI-edge относительно endpoint'ов серверного XML.
function routeReport(xml) {
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
      source: refs.source, target: refs.target,
      startDocked: near(wps[0], s), endDocked: near(wps[wps.length - 1], t),
      startWp: wps[0], endWp: wps[wps.length - 1],
    };
  }
  return report;
}

const run = async () => {
  const auth = await apiLogin();
  const fixture = await createFixture(auth, `s4-${Date.now().toString(36)}`, SEED);
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
    cidKey: CLIENT_ID_STORAGE_KEY, cid: `s4-${Date.now().toString(36)}`,
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

  // Координаты reconnect: конец F_2 (у границы Task_B) → левая грань Task_C.
  const plan = await page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = m.get("canvas");
    const conn = m.get("elementRegistry").get("F_2");
    const target = m.get("elementRegistry").get("Task_C");
    // viewbox: всё важное в кадр
    canvas.viewbox({ x: 100, y: 60, width: 900, height: 520 });
    const toScreen = (p) => {
      const vb = canvas.viewbox();
      const rect = canvas._container.getBoundingClientRect();
      return {
        x: rect.left + (p.x - vb.x) * vb.scale,
        y: rect.top + (p.y - vb.y) * vb.scale,
      };
    };
    const wps = conn.waypoints;
    const end = wps[wps.length - 1];
    // старт reconnect: чуть внутри Task_B от конечной точки стрелки
    const from = toScreen({ x: end.x - 6, y: end.y });
    const to = toScreen({ x: target.x, y: target.y + target.height / 2 });
    return { from, to, endWp: end, targetBounds: { x: target.x, y: target.y, w: target.width, h: target.height } };
  });
  ev({ event: "reconnect-plan", ...plan });

  await page.evaluate(() => { window.__NET__.opsBodies = []; });
  // hover → курсор reconnect; down; drag; up
  await page.mouse.move(plan.from.x, plan.from.y);
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(120);
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      plan.from.x + ((plan.to.x - plan.from.x) * step) / 10,
      plan.from.y + ((plan.to.y - plan.from.y) * step) / 10,
    );
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(5000); // drag-final debounce + ops-flush

  const net = await page.evaluate(() => window.__NET__);
  const opsTypes = net.opsBodies.flatMap((b) => b.operations);
  const before = await getBpmnXml(auth, sid); // server truth ДО restore
  const reportBefore = routeReport(before);
  fs.writeFileSync(`${OUT}/xml/s4-after-reconnect.xml`, before);
  await page.screenshot({ path: `${OUT}/shots/s4-after-reconnect.png` });

  await page.reload({ waitUntil: "domcontentloaded" });
  await openSession();
  const after = await getBpmnXml(auth, sid);
  const reportAfter = routeReport(after);

  const f2Before = reportBefore.F_2 || {};
  const f2After = reportAfter.F_2 || {};
  const result = {
    event: "reconnect-result",
    opsTypes,
    reconnectCount: opsTypes.filter((t) => t === "connection.reconnect").length,
    updateDiCount: opsTypes.filter((t) => t === "element.updateDi").length,
    putCount: net.putCount,
    f2_before: f2Before,
    f2_after: f2After,
    targetMigrated: f2After.target === "Task_C",
    dockedBeforeRestore: f2Before.target === "Task_C" && f2Before.endDocked === true,
    dockedAfterReload: f2After.target === "Task_C" && f2After.endDocked === true,
  };
  ev(result);
  const verdict = {
    event: "VERDICT",
    pass: result.reconnectCount >= 1
      && result.dockedBeforeRestore
      && result.dockedAfterReload
      && result.putCount === 0,
  };
  ev(verdict);
  await browser.close();
  if (!verdict.pass) process.exit(1);
};

run().catch((e) => {
  ev({ event: "ERROR", message: String(e?.message || e) });
  process.exit(1);
});
