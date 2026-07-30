// WS3 — скринкаст: TO BE из реальной сессии ProcessMap на хост-канвасе.
// /app → сайдбар «TO BE» → сессия AS IS → трансформация → … → публикация →
// TO BE-сессия + пилот. Env: WS3_BASE, WS3_TOKEN, WS3_PID, WS3_SID.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.WS3_BASE || "http://127.0.0.1:15177";
const OUT = path.join(ROOT, "docs", "ws3");
const VIDEO_TMP = "/tmp/ws3_video";
const TOKEN = process.env.WS3_TOKEN;
const PID = process.env.WS3_PID;
const SID = process.env.WS3_SID;
const RUN_ID = Date.now().toString(36);
const TPL_NAME = `Супы WS3 (${RUN_ID})`;
const RECIPE_SKU = `ws3_soup_${RUN_ID}`;

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_TMP, { recursive: true, force: true });
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n) });
const log = (...a) => console.log("[ws3]", ...a);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  recordVideo: { dir: VIDEO_TMP, size: { width: 1680, height: 1000 } },
});
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 250)));

try {
  // 1. Хост-канвас /app с сессией «Разогрев супа»
  await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);
  await shot(page, "01_host_canvas_session.png");
  log("host canvas:", page.url());

  // 2. Сайдбар: развернуть rail (если свёрнут) + секция «TO BE»
  const railBtn = await page.$('[data-testid="left-sidebar-handle"] .leftSidebarHandleOpenBtn');
  if (railBtn) { await railBtn.click().catch(() => {}); await page.waitForTimeout(1200); }
  await page.evaluate(() => {
    const head = document.querySelector('[data-section-id="tobe"] .sidebarAccordionHead');
    if (head && head.getAttribute("aria-expanded") === "false") head.click();
  });
  await page.waitForTimeout(600);
  await shot(page, "02_tobe_sidebar.png");
  await page.evaluate((sid) => {
    document.querySelector(`[data-testid="tobe-open-${sid}"]`)?.click();
  }, SID);

  // 3. Рабочее место на хост-канвасе: AS IS слой из сессии
  await page.waitForSelector('[data-testid="canvas-asis"]', { timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot(page, "03_workspace_in_host.png");
  log("workspace embedded, AS IS from session");

  // 4. Трансформация (действие тулбара)
  await page.click('[data-testid="ws-action"]');
  await page.waitForSelector('[data-testid="panel-decisions"]', { timeout: 120000 });
  await page.waitForTimeout(1500);
  await shot(page, "04_transform_decisions.png");
  log("transform done");

  // 5. Имя + сохранить
  await page.click('[data-testid="panel-tab-template"]');
  await page.locator('[data-testid="template-name"]').fill(TPL_NAME);
  await page.click('[data-testid="ws-action"]');
  await page.waitForSelector('[data-testid="ws-notice"]', { timeout: 15000 });
  log("template saved");

  // 5.5 target_ref у get_from_storage (dry-run гигиена)
  const tplList = await (await fetch(`${BASE}/api/process-templates`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const savedTpl = tplList.find((x) => x.name === TPL_NAME);
  const gfsIds = (savedTpl?.ui_model?.nodes || []).filter((n) => n.operation_code === "get_from_storage").map((n) => String(n.id));
  for (const nid of gfsIds) {
    const nodeParams = (savedTpl?.ui_model?.nodes || []).find((n) => String(n.id) === nid)?.params || {};
    if (nodeParams.target_ref) continue;
    const g = await page.$(`[data-testid="canvas-tobe"] g[data-element-id="${nid}"]`);
    if (!g) continue;
    await g.click();
    await page.waitForTimeout(1200);
    const sel = await page.$('[data-testid="param-target_ref"]');
    if (!sel) continue;
    const vals = await sel.$$eval("option", (os) => os.map((o) => o.value).filter(Boolean));
    if (vals.length) {
      await sel.selectOption(vals[0]);
      await page.click('[data-testid="block-save"]');
      await page.waitForTimeout(400);
      log(`target_ref filled for ${nid}`);
      await page.click('[data-testid="panel-tab-step"]').catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  await page.click('[data-testid="ws-save"]');
  await page.waitForTimeout(1000);

  // 6. Рецепт в панели
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
    await page.waitForFunction(
      (tid) => document.querySelectorAll(`[data-testid="${tid}"] option`).length > 1,
      "recipe-param-dish_sku_id",
      { timeout: 15000 },
    );
    const vals = await sku.$$eval("option", (os) => os.map((o) => o.value).filter(Boolean));
    if (vals.length) await sku.selectOption(vals[0]);
  }
  await page.click('[data-testid="recipe-save"]');
  await page.waitForSelector('[data-testid="recipe-notice"]', { timeout: 15000 });
  await shot(page, "05_recipe.png");
  log("recipe saved");

  // 7. Проверка + публикация
  await page.click('[data-testid="ws-action"]'); // «Проверить»
  await page.waitForSelector('[data-testid="panel-findings"]', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot(page, "06_check.png");
  await page.click('[data-testid="panel-tab-versions"]');
  const [pubTpl] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 60000 }),
    page.click('[data-testid="ws-publish"]'),
  ]);
  log("template publish:", pubTpl.status(), pubTpl.status() !== 200 ? (await pubTpl.text()).slice(0, 250) : "");
  if (pubTpl.status() !== 200) throw new Error("template publish failed");
  await page.waitForTimeout(1500);

  // 8. Публикация рецепта
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
  log("recipe publish:", pubRcp.status(), pubRcp.status() !== 200 ? (await pubRcp.text()).slice(0, 250) : "");
  if (pubRcp.status() !== 200) throw new Error("recipe publish failed");

  // 9. Пилот в 1 клик
  await page.click('[data-testid="panel-tab-pilot"]');
  await page.waitForSelector('[data-testid="pilot-create"]', { timeout: 15000 });
  await page.click('[data-testid="pilot-create"]');
  await page.waitForTimeout(3000);
  const pilotErr = await page.$eval('[data-testid="pilot-error"]', (el) => el.textContent).catch(() => null);
  if (pilotErr) log("pilot create ERROR:", pilotErr);
  await page.waitForSelector('[data-testid="pilot-card"]', { timeout: 30000 });
  await page.waitForTimeout(1000);
  await shot(page, "07_pilot.png");
  log("pilot created");

  // 10. TO BE-сессия создана в контуре ProcessMap (WS3.6)
  const sessList = await (await fetch(`${BASE}/api/projects/${PID}/sessions`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const tobeSession = (Array.isArray(sessList) ? sessList : []).find((x) => String(x.title || "").startsWith("TO BE: "));
  log("TO BE session in ProcessMap:", tobeSession ? `${tobeSession.id} «${tobeSession.title}»` : "НЕ НАЙДЕНА");
  if (!tobeSession) log("WARN: TO BE session not created (best-effort)");

  // 11. Хост-функции не сломаны: вернуться к сессии
  await page.click('[data-testid="ws-close"]');
  await page.waitForTimeout(3000);
  await shot(page, "08_back_to_host.png");
  log("done");
} finally {
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(VIDEO_TMP).filter((f) => f.endsWith(".webm"));
  if (vids.length) fs.renameSync(path.join(VIDEO_TMP, vids[0]), path.join(OUT, "ws3_walkthrough.webm"));
  if (pageErrors.length) console.log("pageerrors:", pageErrors);
}
