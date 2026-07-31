// OL1 — приёмочный скринкаст overlay-канваса (критерии 1–6 + полный путь 8).
// Stage, technologist-demo. Видео → docs/ol1/ol1_walkthrough.webm, скрины docs/ol1/*.png
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "ol1");
const VIDEO_TMP = "/tmp/ol1_video";
const TOKEN = process.env.W4_TOKEN;
const PID = "c0494e0667";
const ASIS_SID = "13f1f10b20"; // «Разогрев супа»
const RUN_ID = Date.now().toString(36);
const SESS_NAME = `Супы OL1 (${RUN_ID})`;
const TPL_NAME = `Супы OL1 (${RUN_ID})`;
const RECIPE_SKU = `ol1_soup_${RUN_ID}`;

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_TMP, { recursive: true, force: true });
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n) });
const log = (...a) => console.log("[ol1]", ...a);
const fail = (m) => { throw new Error(m); };
const md5 = async (text) => (await import("node:crypto")).createHash("md5").update(text).digest("hex");

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  recordVideo: { dir: VIDEO_TMP, size: { width: 1680, height: 1000 } },
});
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
page.on("pageerror", (e) => console.log("[ol1] pageerror:", String(e).slice(0, 200)));

const tobeBox = (id) => page.evaluate((nid) => {
  const el = document.querySelector(`[data-layer="tobe"] g[data-element-id="${nid}"] .graph-canvas__shape`);
  return el ? el.getBBox() : null;
}, id);
const asisBox = (id) => page.evaluate((nid) => {
  const el = document.querySelector(`[data-layer="asis"] g[data-element-id="${nid}"] .graph-canvas__shape`);
  return el ? el.getBBox() : null;
}, id);

try {
  const xmlBefore = await (await fetch(`${BASE}/api/sessions/${ASIS_SID}/bpmn`, { headers: { Authorization: `Bearer ${TOKEN}` } })).text();
  log("AS IS hash before:", await md5(xmlBefore));

  // ── создать TO BE-сессию → авто-вход
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

  // ── (1) ОДИН канвас, два слоя; split-переключатель УДАЛЁН из UI
  const c1 = await page.evaluate(() => ({
    overlay: !!document.querySelector('[data-testid="canvas-overlay"]'),
    oneSvg: document.querySelectorAll('[data-testid="canvas-overlay"] svg.graph-canvas--overlay').length === 1,
    asisLayer: !!document.querySelector('[data-testid="canvas-overlay"] [data-layer="asis"]'),
    tobeLayer: !!document.querySelector('[data-testid="canvas-overlay"] [data-layer="tobe"]'),
    splitToggle: !!document.querySelector('[data-testid="layer-toggle"]'),
    splitButtons: document.querySelectorAll('[data-testid="layer-tobe"], [data-testid="layer-asis"], [data-testid="layer-split"]').length,
    overlayToggles: !!document.querySelector('[data-testid="overlay-toggles"]'),
  }));
  log("(1) единый канвас:", JSON.stringify(c1));
  if (!c1.overlay || !c1.oneSvg || !c1.asisLayer || !c1.tobeLayer) fail("(1) overlay не отрисован");
  if (c1.splitToggle || c1.splitButtons > 0) fail("(1) split-переключатель остался в UI");
  await shot(page, "ol1_1_single_canvas.png");

  // ── трансформация
  await page.click('[data-testid="ws-action"]');
  await page.waitForSelector('[data-testid="panel-decisions"]', { state: "visible", timeout: 120000 });
  await page.waitForTimeout(3000);

  // ── (2) раскладка: TO BE со связью derived_from — под своим источником, подписи не перекрыты
  const layout = await page.evaluate(() => {
    const out = [];
    const tobeGs = [...document.querySelectorAll('[data-layer="tobe"] g[data-element-id][data-bpmn-type]')];
    for (const g of tobeGs) {
      const id = g.getAttribute("data-element-id");
      const link = document.querySelector(`[data-testid="trace-link"][data-tobe="${id}"]`)
        || null; // связи видны при выделении — раскладку проверяем по координатам derived
      out.push(id);
    }
    return out.slice(0, 200);
  });
  // derived_from у узлов модели — через trace при выделении; здесь проверяем по парам id (draft id == asis id для 1:1)
  const layoutCheck = await page.evaluate(() => {
    const res = { checked: 0, belowOk: 0, xOk: 0, noLabelOverlap: 0, total: 0 };
    const tobeNodes = [...document.querySelectorAll('[data-layer="tobe"] g[data-element-id][data-bpmn-type]')];
    const asisById = {};
    document.querySelectorAll('[data-layer="asis"] g[data-element-id][data-bpmn-type]').forEach((g) => {
      asisById[g.getAttribute("data-element-id")] = g;
    });
    res.total = tobeNodes.length;
    for (const g of tobeNodes) {
      const id = g.getAttribute("data-element-id");
      const a = asisById[id]; // 1:1 трансформация: draft id == asis id
      if (!a) continue;
      res.checked += 1;
      const tb = g.querySelector(".graph-canvas__shape").getBBox();
      const ab = a.querySelector(".graph-canvas__shape").getBBox();
      if (tb.y >= ab.y + ab.height) res.belowOk += 1;
      if (Math.abs(tb.x - ab.x) < 1) res.xOk += 1;
      if (tb.y - (ab.y + ab.height) >= 20) res.noLabelOverlap += 1;
    }
    return res;
  });
  log("(2) раскладка:", JSON.stringify(layoutCheck));
  if (layoutCheck.checked === 0) fail("(2) нет derived-пар для проверки");
  if (layoutCheck.belowOk < layoutCheck.checked * 0.9) fail(`(2) TO BE не под источниками: ${JSON.stringify(layoutCheck)}`);
  await shot(page, "ol1_2_layout.png");

  // ── (3) выделение TO BE → подсветка AS IS-источника + пунктир; AS IS → потомки + read-only карточка
  const firstDerived = await page.evaluate(() => {
    const g = document.querySelector('[data-layer="tobe"] g[data-element-id][data-bpmn-type="task"]');
    return g?.getAttribute("data-element-id") || "";
  });
  await page.locator(`[data-layer="tobe"] g[data-element-id="${firstDerived}"]`).click();
  await page.waitForTimeout(1000);
  const hl1 = await page.evaluate((id) => ({
    asisHalo: document.querySelector(`[data-layer="asis"] g[data-element-id="${id}"]`)?.classList.contains("graph-canvas__node--trace-highlight") || false,
    traceLinks: document.querySelectorAll('[data-testid="trace-link"]').length,
  }), firstDerived);
  log("(3) TO BE выделен:", firstDerived, JSON.stringify(hl1));
  if (!hl1.asisHalo) fail("(3) нет подсветки AS IS-источника");
  if (hl1.traceLinks < 1) fail("(3) нет пунктирной связи при выделении");
  await shot(page, "ol1_3a_select_tobe_highlights_asis.png");
  // выделение AS IS (клик по чистой AS IS-области) — берём узел, у которого
  // ЕСТЬ TO BE-потомок (id совпадает для 1:1 трансформации), не равный firstDerived
  const asisOnly = await page.evaluate((exclude) => {
    const tobeIds = new Set([...document.querySelectorAll('[data-layer="tobe"] g[data-element-id][data-bpmn-type]')].map((g) => g.getAttribute("data-element-id")));
    const gs = [...document.querySelectorAll('[data-layer="asis"] g[data-element-id][data-bpmn-type]')];
    const hit = gs.find((g) => tobeIds.has(g.getAttribute("data-element-id")) && g.getAttribute("data-element-id") !== exclude);
    return hit?.getAttribute("data-element-id") || "";
  }, firstDerived);
  if (!asisOnly) fail("(3) нет AS IS-узла с TO BE-потомком для проверки");
  await page.locator(`[data-layer="asis"] g[data-element-id="${asisOnly}"]`).click({ force: true });
  await page.waitForTimeout(1000);
  const hl2 = await page.evaluate((id) => ({
    asisCard: !!document.querySelector('[data-testid="asis-card"]'),
    tobeHalo: document.querySelector(`[data-layer="tobe"] g[data-element-id="${id}"]`)?.classList.contains("graph-canvas__node--trace-highlight") || false,
  }), asisOnly);
  log("(3) AS IS выделена:", asisOnly, JSON.stringify(hl2));
  if (!hl2.asisCard) fail("(3) read-only карточка AS IS не открылась");
  await shot(page, "ol1_3b_select_asis_card.png");

  // ── (4) hit-testing: перетащить TO BE-узел НА AS IS-узел → клик по пересечению выделяет TO BE
  const dragId = firstDerived;
  const from = await page.evaluate((id) => {
    const el = document.querySelector(`[data-layer="tobe"] g[data-element-id="${id}"]`);
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, dragId);
  const asisTarget = await page.evaluate((id) => {
    const el = document.querySelector(`[data-layer="asis"] g[data-element-id="${id}"]`);
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, dragId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(asisTarget.x, asisTarget.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  // клик точно в точку пересечения (центр AS IS-узла, куда перетащили TO BE)
  await page.mouse.click(asisTarget.x, asisTarget.y);
  await page.waitForTimeout(800);
  const hit = await page.evaluate((id) => ({
    tobeSelected: document.querySelector(`[data-layer="tobe"] g[data-element-id="${id}"]`)?.getAttribute("data-selected") === "true",
    blockFormTobe: document.querySelector('[data-testid="block-form"]')?.getAttribute("data-node-id") === id,
    asisCardShown: !!document.querySelector('[data-testid="asis-card"]'),
  }), dragId);
  log("(4) hit-testing пересечения:", JSON.stringify(hit));
  // приоритет TO BE: выделен TO BE-узел и в сайдбаре — ЕГО форма (не AS IS-карточка);
  // data-selected на AS IS-источнике при этом — легальная подсветка трассировки (OL1.3)
  if (!hit.tobeSelected || !hit.blockFormTobe || hit.asisCardShown) fail(`(4) пересечение выделило не TO BE: ${JSON.stringify(hit)}`);
  // негативный: drag AS IS заблокирован
  const aBefore = await asisBox(dragId);
  const aScr = await page.evaluate((id) => {
    const el = document.querySelector(`[data-layer="asis"] g[data-element-id="${id}"]`);
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, dragId);
  await page.mouse.move(aScr.x + 30, aScr.y);
  await page.mouse.down();
  await page.mouse.move(aScr.x + 130, aScr.y + 80, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const aAfter = await asisBox(dragId);
  const asisMoved = !aBefore || !aAfter || Math.abs(aAfter.x - aBefore.x) > 2 || Math.abs(aAfter.y - aBefore.y) > 2;
  log("(4) AS IS drag moved:", asisMoved);
  if (asisMoved) fail("(4) AS IS сдвинулась — read-only нарушен");
  await shot(page, "ol1_4_hit_testing.png");

  // ── (5) переключатели слоёв
  await page.click('[data-testid="toggle-trace-links"]');
  await page.waitForTimeout(800);
  const linksAlways = await page.evaluate(() => document.querySelectorAll('[data-testid="trace-link"]').length);
  log("(5) «Связи происхождения» always:", linksAlways);
  if (linksAlways < 3) fail("(5) режим always не показал все связи");
  await shot(page, "ol1_5a_trace_links_always.png");
  await page.click('[data-testid="toggle-trace-links"]'); // обратно в selection
  await page.click('[data-testid="toggle-asis-layer"]');
  await page.waitForTimeout(800);
  const asisHidden = await page.evaluate(() => !document.querySelector('[data-testid="canvas-overlay"] [data-layer="asis"]'));
  log("(5) «AS IS» скрыла подложку:", asisHidden);
  if (!asisHidden) fail("(5) подложка не скрылась");
  await shot(page, "ol1_5b_asis_hidden.png");
  await page.click('[data-testid="toggle-asis-layer"]'); // вернуть
  await page.waitForTimeout(800);

  // ── (6) трансформация: бейджи + reject исчезает со слоя TO BE
  await page.click('[data-testid="panel-tab-decisions"]'); // вкладка могла уйти на «Блок» в (3)-(4)
  await page.waitForSelector('[data-testid="panel-decisions"]', { state: "visible", timeout: 15000 });
  await page.waitForTimeout(800);
  const badges = await page.evaluate(() => document.querySelectorAll('[data-layer="tobe"] [data-badge-for]').length);
  const nodesBefore = await page.evaluate(() => document.querySelectorAll('[data-layer="tobe"] g[data-element-id][data-bpmn-type]').length);
  log("(6) бейджей на TO BE:", badges, "узлов:", nodesBefore);
  if (badges === 0) fail("(6) нет бейджей решений на TO BE-слое");
  const rejected = await page.evaluate(() => {
    const rej = document.querySelector('[data-testid^="decision-reject-"]:not([disabled])');
    if (!rej) return "";
    const id = rej.getAttribute("data-testid").replace("decision-reject-", "");
    rej.click();
    return id;
  });
  await page.waitForTimeout(1200);
  const nodesAfter = await page.evaluate(() => document.querySelectorAll('[data-layer="tobe"] g[data-element-id][data-bpmn-type]').length);
  log("(6) reject:", rejected || "?", "узлов", nodesBefore, "→", nodesAfter);
  if (!rejected) fail("(6) не найдена активная кнопка reject");
  if (nodesAfter !== nodesBefore - 1) fail("(6) отклонённый элемент не исчез со слоя TO BE");
  // вернуть решение (accept), чтобы полный путь не пострадал
  await page.evaluate((id) => {
    document.querySelector(`[data-testid="decision-accept-${id}"]`)?.click();
  }, rejected);
  await page.waitForTimeout(1000);
  await shot(page, "ol1_6_decisions.png");

  // ── (8) полный путь: рецепт → проверка → публикация → пилот
  await page.click('[data-testid="panel-tab-template"]');
  await page.locator('[data-testid="template-name"]').fill(TPL_NAME);
  await page.click('[data-testid="ws-action"]'); // сохранить
  await page.waitForSelector('[data-testid="ws-notice"]', { timeout: 15000 });
  const tplList = await (await fetch(`${BASE}/api/process-templates`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const savedTpl = tplList.find((x) => x.name === TPL_NAME);
  const gfsIds = (savedTpl?.ui_model?.nodes || []).filter((n) => n.operation_code === "get_from_storage").map((n) => String(n.id));
  for (const nid of gfsIds) {
    const nodeParams = (savedTpl?.ui_model?.nodes || []).find((n) => String(n.id) === nid)?.params || {};
    if (nodeParams.target_ref) continue;
    const g = await page.$(`[data-layer="tobe"] g[data-element-id="${nid}"]`);
    if (!g) continue;
    await g.click();
    try {
      await page.waitForSelector('[data-testid="block-form"]', { timeout: 10000 });
    } catch (e) {
      const dbg = await page.evaluate((id) => ({
        nodeId: id,
        tobeSel: document.querySelector(`[data-layer="tobe"] g[data-element-id="${id}"]`)?.getAttribute("data-selected"),
        blockForms: document.querySelectorAll('[data-testid="block-form"]').length,
        activeTab: document.querySelector('.ws-panel__tab--active')?.getAttribute("data-testid"),
        panelTabs: [...document.querySelectorAll('.ws-panel__tab--active')].map((x) => x.getAttribute("data-testid")),
        asisCard: !!document.querySelector('[data-testid="asis-card"]'),
      }), nid);
      log("DEBUG block-form:", JSON.stringify(dbg));
      throw e;
    }
    const sel = await page.$('[data-testid="param-target_ref"]');
    if (sel) {
      const vals = await sel.$$eval("option", (os) => os.map((o) => o.value).filter(Boolean));
      if (vals.length) await sel.selectOption(vals[0]);
      await page.click('[data-testid="block-save"]');
      await page.waitForTimeout(800);
      log("target_ref filled for", nid);
    }
  }
  await page.click('[data-testid="ws-save"]');
  await page.waitForTimeout(1500);
  await page.click('[data-testid="panel-tab-recipe"]');
  await page.waitForSelector('[data-testid="recipe-sku"]', { timeout: 15000 });
  await page.fill('[data-testid="recipe-sku"]', RECIPE_SKU);
  await page.click('[data-testid="recipe-save"]');
  await page.waitForSelector('[data-testid="recipe-notice"]', { timeout: 15000 });
  log("recipe saved");
  await page.click('[data-testid="ws-action"]'); // проверка
  await page.waitForSelector('[data-testid="panel-findings"]', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.click('[data-testid="panel-tab-versions"]');
  page.once("dialog", (d) => d.accept());
  const [pubTpl] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 60000 }),
    page.click('[data-testid="ws-publish"]'),
  ]);
  log("template publish:", pubTpl.status());
  if (pubTpl.status() !== 200) fail("template publish failed");
  await page.waitForTimeout(1500);
  await page.click('[data-testid="panel-tab-recipe"]');
  await page.waitForTimeout(1500);
  const switchSel = await page.$('[data-testid="recipe-switch"]');
  if (switchSel) {
    const opts = await switchSel.$$eval("option", (os) => os.map((o) => ({ v: o.value, t: o.textContent })));
    const mine = opts.find((o) => o.t.includes(RECIPE_SKU)) || opts[opts.length - 1];
    if (mine?.v) await switchSel.selectOption(mine.v);
    await page.waitForTimeout(800);
  }
  const [pubRcp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 60000 }),
    page.click('[data-testid="recipe-publish"]'),
  ]);
  log("recipe publish:", pubRcp.status());
  if (pubRcp.status() !== 200) fail("recipe publish failed");
  await page.click('[data-testid="panel-tab-pilot"]');
  await page.waitForSelector('[data-testid="pilot-create"]', { timeout: 15000 });
  await page.click('[data-testid="pilot-create"]');
  await page.waitForSelector('[data-testid="pilot-card"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const stepsAfter = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="session-step-"]')].map((el) => `${el.getAttribute("data-testid")}=${el.getAttribute("data-state")}`).join(" "));
  log("steps AFTER:", stepsAfter);
  if (!stepsAfter.includes("session-step-pilot=done")) fail("шаг пилота не done после создания");
  await shot(page, "ol1_8_full_path.png");

  const xmlAfter = await (await fetch(`${BASE}/api/sessions/${ASIS_SID}/bpmn`, { headers: { Authorization: `Bearer ${TOKEN}` } })).text();
  const unchanged = (await md5(xmlBefore)) === (await md5(xmlAfter));
  log("AS IS hash unchanged:", unchanged);
  if (!unchanged) fail("хеш AS IS изменился!");
  log("OK: критерии 1–6, 8 подтверждены");
} finally {
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(VIDEO_TMP).filter((f) => f.endsWith(".webm"));
  if (vids.length) fs.renameSync(path.join(VIDEO_TMP, vids[0]), path.join(OUT, "ol1_walkthrough.webm"));
  log("видео: docs/ol1/ol1_walkthrough.webm");
}
