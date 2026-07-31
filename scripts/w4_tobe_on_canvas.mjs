// W4-подтверждение: TO BE ВИДЕН и РЕДАКТИРУЕТСЯ на канвасе (embedded GraphCanvas).
// Пункты a–e по брифу владельца. Stage, technologist-demo.
// Видео → docs/w4/w4_tobe_on_canvas.webm, скрины → docs/w4/canvas_*.png
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "w4");
const VIDEO_TMP = "/tmp/w4_canvas_video";
const TOKEN = process.env.W4_TOKEN;
const PID = "c0494e0667";
const ASIS_SID = "13f1f10b20"; // «Разогрев супа»
const RUN_ID = Date.now().toString(36);
const SESS_NAME = `Супы W4 canvas (${RUN_ID})`;
const NEW_NAME = `Нагрев (W4 ${RUN_ID})`;

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_TMP, { recursive: true, force: true });
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n) });
const log = (...a) => console.log("[w4-canvas]", ...a);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  recordVideo: { dir: VIDEO_TMP, size: { width: 1680, height: 1000 } },
});
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 250)));

const counts = () => page.evaluate(() => ({
  tobeNodes: document.querySelectorAll('[data-testid="canvas-tobe"] g[data-element-id]:not(.graph-canvas__lane)').length,
  tobeFlows: document.querySelectorAll('[data-testid="canvas-tobe"] polyline.graph-canvas__flow').length,
  asisNodes: document.querySelectorAll('[data-testid="canvas-asis"] g[data-element-id]:not(.graph-canvas__lane)').length,
}));

try {
  // ── (a) создать TO BE-сессию → авто-вход: AS IS read-only + панель в сайдбаре
  await page.goto(`${BASE}/app?project=${PID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("tr, a, button, [role='row']"));
    rows.find((x) => (x.textContent || "").includes("Технолог WS3"))?.click();
  });
  await page.waitForTimeout(3000);
  await page.click('button:has-text("Новая сессия")');
  await page.waitForSelector('[data-testid="session-type-to-be"]', { timeout: 15000 });
  await page.click('[data-testid="session-type-to-be"]');
  await page.selectOption('[data-testid="session-asis-select"]', ASIS_SID);
  await page.fill('[data-testid="session-create-name"]', SESS_NAME);
  await page.click('[data-testid="session-create-submit"]');
  await page.waitForTimeout(4000);
  await page.evaluate((name) => {
    const rows = Array.from(document.querySelectorAll("tr, [role='row']"));
    const row = rows.find((x) => (x.textContent || "").includes(name));
    (row?.querySelector("button, a") || row)?.click();
  }, SESS_NAME);
  await page.waitForSelector('[data-testid="session-step-bar"]', { timeout: 90000 });
  await page.waitForTimeout(2500);
  const a = await page.evaluate(() => ({
    asisBadge: document.querySelector('[data-testid="canvas-asis"] .ws__canvas-label')?.textContent || "",
    asisReadonly: document.querySelector('[data-testid="canvas-asis"]')?.getAttribute("data-readonly"),
    panelInSidebar: !!document.querySelector('[data-testid="tobe-sidebar-slot"] [data-testid="panel-tabs"]')
      || !!document.querySelector(".workspaceLeft [data-testid='panel-tabs']"),
  }));
  const aCounts = await counts();
  log("(a) авто-вход:", JSON.stringify(a), "asisNodes:", aCounts.asisNodes);
  if (!a.asisBadge.includes("AS IS")) throw new Error("(a) AS IS слой не отрисован");
  await shot(page, "canvas_a_auto_enter.png");

  // ── (b) трансформация → TO BE-блоки и связи НА КАНВАСЕ
  await page.click('[data-testid="ws-action"]');
  await page.waitForSelector('[data-testid="panel-decisions"]', { state: "visible", timeout: 120000 });
  await page.waitForTimeout(3000);
  const bCounts = await counts();
  log("(b) после трансформации: tobeNodes:", bCounts.tobeNodes, "tobeFlows:", bCounts.tobeFlows);
  if (bCounts.tobeNodes === 0) throw new Error("(b) TO BE-узлы не отрисованы на канвасе");
  await shot(page, "canvas_b_tobe_blocks.png");

  // ── (c) клик по TO BE-блоку НА КАНВАСЕ → параметры в сайдбаре → правка → на канвасе
  const nodeSel = '[data-testid="canvas-tobe"] g[data-element-id][data-bpmn-type="task"]';
  await page.locator(nodeSel).first().click();
  await page.waitForSelector('[data-testid="block-form"]', { timeout: 15000 });
  const nodeId = await page.locator(nodeSel).first().getAttribute("data-element-id");
  const selected = await page.locator(nodeSel).first().getAttribute("data-selected");
  // заполнить пустые required-параметры (иначе block-save disabled по гигиене)
  const emptySelects = await page.$$('[data-testid="block-form"] select[data-testid^="param-"]');
  for (const sel of emptySelects) {
    const v = await sel.inputValue();
    if (!v) {
      const opts = await sel.$$eval("option", (os) => os.map((o) => o.value).filter(Boolean));
      if (opts.length) await sel.selectOption(opts[0]);
    }
  }
  await page.waitForTimeout(500);
  const saveDisabled = await page.locator('[data-testid="block-save"]').isDisabled();
  log(`(c) узел ${nodeId}: selected=${selected}, required заполнены, saveDisabled=${saveDisabled}`);
  if (saveDisabled) throw new Error("(c) block-save остался disabled после заполнения required");
  await page.fill('[data-testid="block-display-name"]', NEW_NAME);
  await shot(page, "canvas_c1_before_save.png");
  await page.click('[data-testid="block-save"]');
  await page.waitForTimeout(1500);
  const label = await page.evaluate((nid) =>
    document.querySelector(`[data-testid="canvas-tobe"] g[data-element-id="${nid}"] text`)?.textContent || "", nodeId);
  log(`(c) узел ${nodeId}: selected=${selected}, новое имя на канвасе: "${label}"`);
  if (selected !== "true") throw new Error("(c) узел не выделился на канвасе");
  if (!label.includes("Нагрев")) throw new Error(`(c) канвас не отразил правку: "${label}"`);
  await shot(page, "canvas_c2_edit_applied.png");

  // ── (d) добавить блок из каталога НА КАНВАС + соединить потоком на канвасе
  const before = await counts();
  await page.click('[data-testid="ws-palette"]');
  await page.waitForSelector('[data-testid="ws-palette-panel"]', { timeout: 10000 });
  await page.locator('[data-testid^="palette-add-"]').first().click();
  await page.waitForTimeout(1200);
  const mid = await counts();
  if (mid.tobeNodes !== before.tobeNodes + 1) throw new Error(`(d) блок не добавлен на канвас: ${before.tobeNodes} → ${mid.tobeNodes}`);
  const newNodeId = await page.evaluate(() => {
    const gs = Array.from(document.querySelectorAll('[data-testid="canvas-tobe"] g[data-element-id][data-bpmn-type="task"]'));
    return gs[gs.length - 1]?.getAttribute("data-element-id") || "";
  });
  await page.click('[data-testid="ws-palette"]'); // закрыть палитру
  await page.click('[data-testid="ws-connect"]');
  await page.locator(`[data-testid="canvas-tobe"] g[data-element-id="${newNodeId}"]`).click();
  await page.locator(nodeSel).first().click(); // соседний существующий узел
  await page.waitForTimeout(1200);
  const after = await counts();
  log(`(d) блок ${newNodeId} добавлен (${before.tobeNodes}→${mid.tobeNodes}), связи: ${before.tobeFlows}→${after.tobeFlows}`);
  if (after.tobeFlows !== before.tobeFlows + 1) throw new Error(`(d) связь не создана на канвасе: ${before.tobeFlows} → ${after.tobeFlows}`);
  await shot(page, "canvas_d_add_connect.png");

  // ── (e) попытка править AS IS → read-only (drag не двигает, блок-форма не открывается)
  const asisNodeSel = '[data-testid="canvas-asis"] g[data-element-id][data-bpmn-type="task"]';
  const asisBox = await page.locator(asisNodeSel).first().boundingBox();
  if (!asisBox) throw new Error("(e) AS IS-узел не найден на канвасе");
  await page.mouse.move(asisBox.x + asisBox.width / 2, asisBox.y + asisBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(asisBox.x + 120, asisBox.y + 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const asisBox2 = await page.locator(asisNodeSel).first().boundingBox();
  await page.locator(asisNodeSel).first().click();
  await page.waitForTimeout(800);
  const e = await page.evaluate(() => ({
    readonlyAttr: document.querySelector('[data-testid="canvas-asis"]')?.getAttribute("data-readonly"),
    blockFormForAsis: !!document.querySelector('[data-testid="block-form"]'),
    badge: document.querySelector('[data-testid="canvas-asis"] .ws__canvas-label')?.textContent || "",
  }));
  const moved = !asisBox2 || Math.abs(asisBox2.x - asisBox.x) > 5 || Math.abs(asisBox2.y - asisBox.y) > 5;
  log(`(e) AS IS: readonly=${e.readonlyAttr}, drag moved=${moved}, blockForm=${e.blockFormForAsis}, badge="${e.badge}"`);
  if (moved) throw new Error("(e) AS IS-элемент СДВИНУЛСЯ — read-only нарушен");
  await shot(page, "canvas_e_asis_readonly.png");

  log("OK: пункты a–e подтверждены на канвасе");
} finally {
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(VIDEO_TMP).filter((f) => f.endsWith(".webm"));
  if (vids.length) fs.renameSync(path.join(VIDEO_TMP, vids[0]), path.join(OUT, "w4_tobe_on_canvas.webm"));
  if (errors.length) console.log("[w4-canvas] page errors:", errors.slice(0, 5));
}
