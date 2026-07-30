// WS1 — скринкаст полного воркфлоу на рабочем месте (stage, technologist-demo).
// Импорт → трансформация → конструирование → рецепт → проверка → публикация →
// пилот — НА ОДНОЙ СТРАНИЦЕ /technologist/workspace.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.WS1_BASE || "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "ws1");
const VIDEO_TMP = "/tmp/ws1_video";
const FIXTURE = path.join(ROOT, "backend/tests/fixtures/itmo_razogrev_v02.bpmn");
const TOKEN = process.env.WS1_TOKEN;
const RUN_ID = Date.now().toString(36);
const TPL_NAME = `Супы WS1 (${RUN_ID})`;
const RECIPE_SKU = `ws1_soup_${RUN_ID}`;

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_TMP, { recursive: true, force: true });
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n) });
const log = (...a) => console.log("[ws1]", ...a);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  recordVideo: { dir: VIDEO_TMP, size: { width: 1680, height: 1000 } },
});
const page = await context.newPage();
await page.addInitScript((t2) => window.localStorage.setItem("fpc_auth_access_token", t2), TOKEN);
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

try {
  // 1. Рабочее место: действие «Импортировать AS IS»
  await page.goto(`${BASE}/technologist/workspace`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector('[data-testid="ws-action"]', { timeout: 30000 });
  await shot(page, "01_workspace_empty.png");

  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 10000 }),
    page.click('[data-testid="ws-action"]'),
  ]);
  await fileChooser.setFiles(FIXTURE);
  await page.waitForSelector('[data-testid="canvas-asis"]', { timeout: 60000 });
  await page.waitForSelector('[data-testid="ws-legacy-hint"]', { timeout: 15000 });
  await shot(page, "02_import_as_is_layer.png");
  log("import: AS IS слой + legacy hint");

  // 2. Трансформация на канвасе
  await page.click('[data-testid="ws-action"]'); // «Перейти к трансформации»
  await page.waitForSelector('[data-testid="panel-decisions"]', { timeout: 120000 });
  await page.waitForTimeout(1500);
  await shot(page, "03_transform_decisions.png");
  log("transform: решения в панели + бейджи на схеме");
  // отклонить первое решение из панели → бейдж ✗ на схеме
  const firstReject = await page.$('[data-testid^="decision-reject-"]:not([disabled])');
  if (firstReject) {
    await firstReject.click();
    await page.waitForTimeout(600);
    await shot(page, "04_decision_rejected.png");
    log("decision rejected on canvas");
  }

  // 3. Сохранить шаблон (действие тулбара «Сохранить»)
  await page.fill('input[value]', "").catch(() => {});
  // имя шаблона — через вкладку «Шаблон» панели
  await page.click('[data-testid="panel-tab-template"]');
  const nameInput = page.locator('[data-testid="template-name"]');
  await nameInput.fill(TPL_NAME);
  await page.click('[data-testid="ws-action"]');
  await page.waitForSelector('[data-testid="ws-notice"]', { timeout: 15000 });
  log("template saved");

  // 3.5 dry-run гигиена: target_ref у get_from_storage (как в UX1)
  const tplList = await (await fetch(`${BASE}/api/process-templates`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const savedTpl = tplList.find((x) => x.name === TPL_NAME) || tplList[tplList.length - 1];
  const gfsIds = (savedTpl?.ui_model?.nodes || []).filter((n) => n.operation_code === "get_from_storage").map((n) => String(n.id));
  for (const nid of gfsIds) {
    const g = await page.$(`[data-testid="canvas-tobe"] g[data-element-id="${nid}"]`);
    log(`gfs ${nid}: g=${!!g}`);
    if (!g) continue;
    await g.click();
    await page.waitForTimeout(1500);
    const activeTab = await page.$eval('.ws-panel__tab--active', (el) => el.textContent).catch(() => "none");
    const hasForm = !!(await page.$('[data-testid="block-form"]'));
    log(`gfs ${nid}: tab=${activeTab} form=${hasForm}`);
    await page.waitForSelector('[data-testid="param-target_ref"]', { timeout: 8000 }).catch(() => {});
    const sel = await page.$('[data-testid="param-target_ref"]');
    log(`gfs ${nid}: sel=${!!sel}`);
    if (!sel) continue;
    const cur = await sel.evaluate((n) => n.value);
    const vals = await sel.$$eval("option", (os) => os.map((o) => o.value).filter(Boolean));
    const nodeParams = (savedTpl?.ui_model?.nodes || []).find((n) => String(n.id) === nid)?.params || {};
    const needsFill = !nodeParams.target_ref;
    log(`gfs ${nid}: cur="${cur}" opts=${vals.length} needsFill=${needsFill}`);
    if (needsFill && vals.length) {
      await sel.selectOption(vals[0]);
      await page.click('[data-testid="block-save"]');
      await page.waitForTimeout(400);
      log(`target_ref filled for ${nid}`);
      // форма блока не сбрасывает state при смене узла — переключаем вкладку,
      // чтобы следующий блок открылся чистой формой
      await page.click('[data-testid="panel-tab-step"]').catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  await page.click('[data-testid="ws-save"]');
  await page.waitForTimeout(1000);

  // 4. Рецепт в панели
  await page.click('[data-testid="panel-tab-recipe"]');
  await page.waitForSelector('[data-testid="recipe-sku"]', { timeout: 15000 });
  await page.fill('[data-testid="recipe-sku"]', RECIPE_SKU);
  await page.waitForSelector('[data-testid="recipe-param-heat_time_sec"]', { timeout: 15000 });
  const setParam = async (tid, v) => page.evaluate(([t3, val]) => {
    const el = document.querySelector(`[data-testid="${t3}"]`);
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, val);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  }, [tid, v]);
  await setParam("recipe-param-heat_time_sec", "90");
  await setParam("recipe-param-target_temp_c", "75");
  await setParam("recipe-param-qty", "20");
  const hp = await page.$('[data-testid="recipe-param-heating_power"]');
  if (hp) await hp.selectOption("medium");
  const sku = await page.$('[data-testid="recipe-param-dish_sku_id"]');
  if (sku) {
    const vals = await sku.$$eval("option", (os) => os.map((o) => o.value).filter(Boolean));
    if (vals.length) await sku.selectOption(vals[0]);
  }
  await page.click('[data-testid="recipe-save"]');
  await page.waitForTimeout(2500);
  const recipeErr = await page.$eval('[data-testid="recipe-error"]', (el) => el.textContent).catch(() => null);
  if (recipeErr) log("recipe save ERROR:", recipeErr);
  await page.waitForSelector('[data-testid="recipe-notice"]', { timeout: 15000 });
  await shot(page, "05_recipe_panel.png");
  log("recipe saved in panel");

  // 5. Проверка на канвасе
  await page.click('[data-testid="ws-action"]'); // «Проверить» (после save действие=check)
  await page.waitForSelector('[data-testid="panel-findings"]', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot(page, "06_check_findings.png");
  log("check done");

  // 6. Публикация из вкладки «Версии»
  await page.click('[data-testid="panel-tab-versions"]');
  const [pubTpl] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 60000 }),
    page.click('[data-testid="ws-publish"]'),
  ]);
  log("template publish:", pubTpl.status(), pubTpl.status() !== 200 ? (await pubTpl.text()).slice(0, 200) : "");
  if (pubTpl.status() !== 200) throw new Error("template publish failed");
  await page.waitForTimeout(1200);
  await shot(page, "07_published_versions.png");

  // 7. Публикация рецепта в панели (после ремаунта панели — выбрать рецепт)
  await page.click('[data-testid="panel-tab-recipe"]');
  await page.waitForTimeout(1500);
  const switchSel = await page.$('[data-testid="recipe-switch"]');
  if (switchSel) {
    const opts = await switchSel.$$eval("option", (os) => os.map((o) => ({ v: o.value, t: o.textContent })));
    const mine = opts.find((o) => o.t.includes(RECIPE_SKU)) || opts[opts.length - 1];
    if (mine?.v) await switchSel.selectOption(mine.v);
    await page.waitForTimeout(800);
  }
  await page.waitForSelector('[data-testid="recipe-publish"]:not([disabled])', { timeout: 15000 });
  const [pubRcp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 60000 }),
    page.click('[data-testid="recipe-publish"]'),
  ]);
  log("recipe publish:", pubRcp.status(), pubRcp.status() !== 200 ? (await pubRcp.text()).slice(0, 200) : "");
  if (pubRcp.status() !== 200) throw new Error("recipe publish failed");

  // 8. Пилот в 1 клик из панели
  await page.click('[data-testid="panel-tab-pilot"]');
  await page.waitForSelector('[data-testid="pilot-create"]', { timeout: 15000 });
  await page.click('[data-testid="pilot-create"]');
  await page.waitForTimeout(3000);
  const pilotErr = await page.$eval('[data-testid="pilot-error"]', (el) => el.textContent).catch(() => null);
  if (pilotErr) log("pilot create ERROR:", pilotErr);
  await page.waitForSelector('[data-testid="pilot-card"]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await shot(page, "08_pilot_created.png");
  log("pilot created on workspace");

  // 9. Скачать BPMN
  await page.click('[data-testid="panel-tab-versions"]');
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.click('[data-testid="ws-download-bpmn"]'),
  ]);
  const dlPath = path.join(OUT, "ws1_soups.bpmn");
  await download.saveAs(dlPath);
  log("bpmn downloaded:", fs.existsSync(dlPath));

  // 10. Панель: float + drag + persist
  await page.click('[data-testid="panel-mode-toggle"]');
  await page.waitForTimeout(400);
  const handle = page.locator('[data-testid="panel-drag-handle"]');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + 60, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + 160, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await shot(page, "09_panel_float.png");
  const persisted = await page.evaluate(() => window.localStorage.getItem("fpc_ws1_panel"));
  log("panel float+persist:", persisted);
  await page.click('[data-testid="panel-mode-toggle"]'); // обратно в dock
  await page.waitForTimeout(300);
  await shot(page, "10_panel_dock.png");

  // 11. Слои: AS IS отдельно
  await page.click('[data-testid="layer-asis"]');
  await page.waitForTimeout(500);
  await shot(page, "11_layer_asis.png");
  await page.click('[data-testid="layer-tobe"]');
  log("done");
} finally {
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(VIDEO_TMP).filter((f) => f.endsWith(".webm"));
  if (vids.length) fs.renameSync(path.join(VIDEO_TMP, vids[0]), path.join(OUT, "ws1_walkthrough.webm"));
  if (pageErrors.length) console.log("pageerrors:", pageErrors);
}
