// S1 probe: что реально фаерит канвас при одиночном drag и resize —
// commandStack.changed outermost command + ключи контекста + наличие
// affectedConnections в notifyChange payload.
import { chromium } from "playwright";
import {
  APP_BASE, API_BASE, apiLogin, createFixture,
  ACCESS_TOKEN_KEY, ACTIVE_ORG_KEY, CLIENT_ID_STORAGE_KEY,
} from "/Users/mac/agents_place/kimi_PM/.planning/contours/audit/c1-c2-stage-verification/lib.mjs";

const SEED = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_p" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_p" isExecutable="false">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>F_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Task_A" name="A"><bpmn:incoming>F_1</bpmn:incoming><bpmn:outgoing>F_2</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="Task_B" name="B"><bpmn:incoming>F_2</bpmn:incoming></bpmn:userTask>
    <bpmn:sequenceFlow id="F_1" sourceRef="Start_1" targetRef="Task_A"/>
    <bpmn:sequenceFlow id="F_2" sourceRef="Task_A" targetRef="Task_B"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Process_p">
    <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1"><dc:Bounds x="172" y="182" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A"><dc:Bounds x="300" y="160" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B"><dc:Bounds x="540" y="160" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="F_1_di" bpmnElement="F_1"><di:waypoint x="208" y="200"/><di:waypoint x="300" y="200"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F_2_di" bpmnElement="F_2"><di:waypoint x="420" y="200"/><di:waypoint x="540" y="200"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const run = async () => {
  const auth = await apiLogin();
  const fixture = await createFixture(auth, `probe-${Date.now().toString(36)}`, SEED);
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: APP_BASE, viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(({ tokenKey, token, orgKey, orgId, cidKey, cid }) => {
    window.localStorage.setItem(tokenKey, token);
    if (orgId) window.localStorage.setItem(orgKey, orgId);
    window.sessionStorage.setItem(cidKey, cid);
  }, {
    tokenKey: ACCESS_TOKEN_KEY, token: auth.token,
    orgKey: ACTIVE_ORG_KEY, orgId: auth.activeOrgId,
    cidKey: CLIENT_ID_STORAGE_KEY, cid: `probe-${Date.now().toString(36)}`,
  });
  const page = await context.newPage();
  await page.goto(`/app?${new URLSearchParams({ project: fixture.projectId, session: fixture.sessionId }).toString()}`);
  await page.waitForFunction(() => {
    const m = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    return !!m && !!m.get("elementRegistry").get("Task_A");
  }, null, { timeout: 120_000 });

  await page.evaluate(() => {
    window.__CMDS__ = [];
    window.__CHANGES__ = [];
    const m = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const cs = m.get("commandStack");
    // Как рантайн: оборачиваем commandStack.execute, трекаем глубину.
    const origExecute = cs.execute.bind(cs);
    let depth = 0;
    let outer = null;
    cs.execute = (cmd, ctx) => {
      const isOuter = depth === 0;
      depth += 1;
      if (isOuter) outer = { command: cmd, context: ctx };
      try {
        return origExecute(cmd, ctx);
      } finally {
        depth -= 1;
        if (depth === 0) outer = null;
      }
    };
    cs.__pmOuterTrack = true;
    m.get("eventBus").on("commandStack.changed", 500, () => {
      const ctx = outer?.context || {};
      window.__CMDS__.push({
        command: outer?.command || null,
        ctxKeys: Object.keys(ctx),
        hasClosure: !!ctx.closure,
        closureConns: ctx.closure?.allConnections ? Object.keys(ctx.closure.allConnections) : null,
        shapes: Array.isArray(ctx.shapes) ? ctx.shapes.map((s) => `${s.id}:${s.incoming?.length ?? "?"}/${s.outgoing?.length ?? "?"}`) : null,
        shape: ctx.shape ? `${ctx.shape.id}:in${ctx.shape.incoming?.length ?? "?"}/out${ctx.shape.outgoing?.length ?? "?"}` : null,
        hints: ctx.hints ? Object.keys(ctx.hints) : null,
      });
      // Пейлоад, который реально уходит в outbox (notifyChange дескриптор).
      try {
        const snap = {};
        // eslint-disable-next-line no-undef
        window.__CHANGES__.push({ pending: "see onChange" });
      } catch { /* noop */ }
    });
    // Перехват дескриптора на уровне wiring: подписываемся на outbox-маппинг
    // через перехват fetch уже снаружи; здесь — снапшот commandContext из
    // notifyChange рантайма.
    const rt = window.__FPC_E2E_RUNTIME__;
    if (rt?.onChange) {
      rt.onChange((ev) => {
        if (ev?.type === "commandStack.changed") {
          window.__CHANGES__.push({
            command: ev.command,
            action: ev.action,
            ctxKeys: Object.keys(ev.commandContext || {}),
            hasAffected: Array.isArray(ev.commandContext?.affectedConnections),
            affectedIds: Array.isArray(ev.commandContext?.affectedConnections)
              ? ev.commandContext.affectedConnections.map((c) => c.id) : null,
          });
        }
      });
    }
  });

  const focus = await page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = m.get("canvas");
    const el = m.get("elementRegistry").get("Task_A");
    const host = document.querySelector(".bpmnStageHost").getBoundingClientRect();
    const vb = canvas.viewbox();
    canvas.viewbox({
      x: (el.x + el.width / 2) - (700 - host.left) / vb.scale,
      y: (el.y + el.height / 2) - (500 - host.top) / vb.scale,
      width: vb.width, height: vb.height,
    });
    const r = canvas.getGraphics(el).getBoundingClientRect();
    return { px: r.x + r.width / 2, py: r.y + r.height / 2 };
  });
  await page.mouse.move(focus.px, focus.py);
  await page.mouse.down();
  for (let s = 1; s <= 8; s += 1) {
    await page.mouse.move(focus.px + (160 * s) / 8, focus.py + (120 * s) / 8);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const cmds = await page.evaluate(() => window.__CMDS__);
  const changes = await page.evaluate(() => window.__CHANGES__);
  console.log(JSON.stringify({ event: "drag-cmds", cmds, changes }, null, 1));

  // resize handle probe
  const handleInfo = await page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const sel = m.get("selection");
    const el = m.get("elementRegistry").get("Task_A");
    sel.select(el);
    const all = [...document.querySelectorAll("[class*='resize']")].map((n) => n.getAttribute("class"));
    return { selected: sel.get()?.id || null, resizeClasses: all.slice(0, 12) };
  });
  console.log(JSON.stringify({ event: "resize-handles", ...handleInfo }));
  await page.waitForTimeout(300);
  const handleInfo2 = await page.evaluate(() => {
    const all = [...document.querySelectorAll("[class*='resize']")].map((n) => ({
      cls: n.getAttribute("class"),
      tag: n.tagName,
    }));
    return all.slice(0, 12);
  });
  console.log(JSON.stringify({ event: "resize-handles-after", handles: handleInfo2 }));

  await browser.close();
};

run().catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
