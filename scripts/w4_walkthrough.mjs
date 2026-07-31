// W4 — скринкаст: создание TO BE-сессии с типом → AS IS read-only → воркфлоу
// с сессионными шагами → публикация → пилот. Stage, technologist-demo.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "w4");
const VIDEO_TMP = "/tmp/w4_video";
const TOKEN = process.env.W4_TOKEN;
const PID = "c0494e0667";
const ASIS_SID = "13f1f10b20"; // «Разогрев супа»
const RUN_ID = Date.now().toString(36);
const TPL_NAME = `Супы W4 (${RUN_ID})`;
const RECIPE_SKU = `w4_soup_${RUN_ID}`;

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_TMP, { recursive: true, force: true });
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n) });
const log = (...a) => console.log("[w4]", ...a);
const md5 = async (text) => (await import("node:crypto")).createHash("md5").update(text).digest("hex");

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  recordVideo: { dir: VIDEO_TMP, size: { width: 1680, height: 1000 } },
});
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 250)));

try {
  // 0. хеш AS IS до
  const xmlBefore = await (await fetch(`${BASE}/api/sessions/${ASIS_SID}/bpmn`, { headers: { Authorization: `Bearer ${TOKEN}` } })).text();
  log("AS IS hash before:", await md5(xmlBefore));

  // 1. /app проект → создание сессии с типом TO BE + AS IS «Разогрев супа»
  await page.goto(`${BASE}/app?project=${PID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(5000);
  // открыть проект (из списка проектов), затем «Новая сессия»
  await page.evaluate((pid) => {
    const rows = Array.from(document.querySelectorAll("tr, a, button, [role='row']"));
    const row = rows.find((x) => (x.textContent || "").includes("Технолог WS3"));
    row?.click();
  }, PID);
  await page.waitForTimeout(3000);
  await shot(page, "01_project.png");
  await page.click('button:has-text("Новая сессия")');
  await page.waitForSelector('[data-testid="session-type-to-be"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="session-create-modal"]', { timeout: 15000 });
  await page.click('[data-testid="session-type-to-be"]');
  await page.selectOption('[data-testid="session-asis-select"]', ASIS_SID);
  await page.fill('[data-testid="session-create-name"]', TPL_NAME);
  await shot(page, "02_create_tobe_session.png");
  await page.click('[data-testid="session-create-submit"]');
  await page.waitForTimeout(4000);
  // открыть новую to_be-сессию → авто-вход в рабочее место
  await page.evaluate((name) => {
    const rows = Array.from(document.querySelectorAll("tr, [role='row']"));
    const row = rows.find((x) => (x.textContent || "").includes(name));
    const btn = row?.querySelector("button, a");
    (btn || row)?.click();
  }, TPL_NAME);
  await page.waitForTimeout(3000);

  // 2. Рабочее место: AS IS из связи + сессионный статус-бар (новая сессия!)
  await page.waitForSelector('[data-testid="session-step-bar"]', { timeout: 90000 });
  await page.waitForTimeout(2500);
  await shot(page, "03_workspace_session_steps.png");
  const stepsState = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="session-step-"]')).map((el) => `${el.getAttribute("data-testid")}=${el.getAttribute("data-state")}`).join(" "),
  );
  log("session steps:", stepsState);

  // 3. AS IS read-only: бейдж + попытка правки невозможна (нет хендлеров)
  const roBadge = await page.evaluate(() => document.querySelector('[data-testid="canvas-overlay"] .ws__canvas-label')?.textContent || document.querySelector('[data-testid="canvas-asis"] .ws__canvas-label')?.textContent || "");
  log("AS IS badge:", roBadge);
  await shot(page, "04_asis_readonly.png");

  // 4. Параметры — в ЛЕВОМ сайдбаре
  const sidebarPanel = await page.$('[data-testid="tobe-params-sidebar"]');
  log("params in left sidebar:", !!sidebarPanel);
  await shot(page, "05_params_left_sidebar.png");

  // 5. Трансформация
  await page.click('[data-testid="ws-action"]');
  await page.waitForSelector('[data-testid="panel-decisions"]', { timeout: 120000 });
  await page.waitForTimeout(1500);
  await shot(page, "06_transform.png");
  log("transform done");

  // 6. Имя + сохранить + dry-run гигиена
  await page.click('[data-testid="panel-tab-template"]');
  await page.locator('[data-testid="template-name"]').fill(TPL_NAME);
  await page.click('[data-testid="ws-action"]');
  await page.waitForSelector('[data-testid="ws-notice"]', { timeout: 15000 });
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

  // 7. Рецепт
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
  log("recipe saved");

  // 8. Проверка + публикация (гейтинг: проверка пройдена — без confirm)
  await page.click('[data-testid="ws-action"]');
  await page.waitForSelector('[data-testid="panel-findings"]', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot(page, "07_check.png");
  await page.click('[data-testid="panel-tab-versions"]');
  page.once("dialog", (d) => d.accept());
  const [pubTpl] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 60000 }),
    page.click('[data-testid="ws-publish"]'),
  ]);
  log("template publish:", pubTpl.status(), pubTpl.status() !== 200 ? (await pubTpl.text()).slice(0, 200) : "");
  if (pubTpl.status() !== 200) throw new Error("template publish failed");
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
  log("recipe publish:", pubRcp.status(), pubRcp.status() !== 200 ? (await pubRcp.text()).slice(0, 200) : "");
  if (pubRcp.status() !== 200) throw new Error("recipe publish failed");

  // 9. Пилот + шаги все done
  await page.click('[data-testid="panel-tab-pilot"]');
  await page.waitForSelector('[data-testid="pilot-create"]', { timeout: 15000 });
  await page.click('[data-testid="pilot-create"]');
  await page.waitForSelector('[data-testid="pilot-card"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot(page, "08_pilot.png");
  const stepsAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="session-step-"]')).map((el) => `${el.getAttribute("data-testid")}=${el.getAttribute("data-state")}`).join(" "),
  );
  log("session steps AFTER:", stepsAfter);

  // 10. TO BE-сессия создана + AS IS не изменилась
  const sessList = await (await fetch(`${BASE}/api/projects/${PID}/sessions`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const tobeSession = (Array.isArray(sessList) ? sessList : []).find((x) => String(x.title || "").includes(TPL_NAME.slice(0, 12)));
  log("TO BE session:", tobeSession ? `${tobeSession.id} layer=${tobeSession.process_layer}` : "не найдена");
  const xmlAfter = await (await fetch(`${BASE}/api/sessions/${ASIS_SID}/bpmn`, { headers: { Authorization: `Bearer ${TOKEN}` } })).text();
  log("AS IS hash after:", await md5(xmlAfter), "| unchanged:", (await md5(xmlBefore)) === (await md5(xmlAfter)));
} finally {
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(VIDEO_TMP).filter((f) => f.endsWith(".webm"));
  if (vids.length) fs.renameSync(path.join(VIDEO_TMP, vids[0]), path.join(OUT, "w4_walkthrough.webm"));
  if (errors.length) console.log("pageerrors:", errors);
}
