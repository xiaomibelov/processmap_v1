// UX1 — финальный скринкаст воркфлоу под technologist-demo (без инструкции).
// Импорт AS IS → трансформация (1 клик) → конструктор → рецепт → проверка →
// публикация → пилот (1 клик). Env: BASE (15177 local | stage URL).
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.UX1_BASE || "http://127.0.0.1:15177";
const OUT = process.env.UX1_OUT || path.join(ROOT, "docs", "ux1");
const VIDEO_TMP = "/tmp/ux1_video";
const FIXTURE = path.join(ROOT, "backend/tests/fixtures/itmo_razogrev_v02.bpmn");
const RUN_ID = Date.now().toString(36);
const TPL_NAME = `Супы UX1 (${RUN_ID})`;
const RECIPE_SKU = `ux1_soup_${RUN_ID}`;
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_TMP, { recursive: true, force: true });

const TOKEN = process.env.UX1_TOKEN;
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n) });
const log = (...a) => console.log("[ux1]", ...a);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  recordVideo: { dir: VIDEO_TMP, size: { width: 1680, height: 1000 } },
});
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

try {
  // 1. Главная «Мои процессы» + «Новый процесс из AS IS»
  await page.goto(`${BASE}/technologist`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector('[data-testid="home-new-process"]', { timeout: 30000 });
  await shot(page, "01_home.png");
  await page.click('[data-testid="home-new-process"]');
  await page.waitForSelector('input[type="file"]', { state: "attached", timeout: 30000 });

  // 2. Импорт AS IS ИТМО → hint + «Перейти к трансформации»
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await page.click('button[type="submit"]');
  await page.waitForSelector('[data-testid="import-summary"]', { timeout: 60000 });
  await page.waitForSelector('[data-testid="legacy-transform-hint"]', { timeout: 15000 });
  await shot(page, "02_import_legacy_hint.png");
  await page.click('[data-testid="go-to-transform"]');

  // 3. Трансформация: автостарт из handoff (без выбора файла!)
  await page.waitForSelector('[data-testid="transform-summary"]', { timeout: 120000 });
  await page.waitForTimeout(1000);
  await shot(page, "03_transform_autostart.png");
  log("handoff import→transform OK");
  await page.$$eval(".transform-review__accept", (btns) => btns.forEach((b) => b.click()));
  await page.click(".transform-review__to-constructor");

  // 4. Конструктор: сохранить → баннер «Следующий шаг: Создать рецепт»
  await page.waitForSelector('[data-testid="template-save"]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.fill('[data-testid="template-name"]', TPL_NAME);
  await shot(page, "04_constructor_handoff.png");
  await page.click('[data-testid="template-save"]');
  await page.waitForSelector('[data-testid="next-step-banner"]', { timeout: 15000 });
  // dry-run гигиена AI-черновика: обязательный target_ref у get_from_storage
  // (технолог отвечает на «открытые вопросы» — часть реального воркфлоу)
  const tplList = await (await fetch(`${BASE}/api/process-templates`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const savedTpl = tplList.find((x) => x.name === TPL_NAME) || tplList[tplList.length - 1];
  const uiModel = savedTpl?.ui_model || {};
  const gfsIds = (uiModel.nodes || []).filter((n) => n.operation_code === "get_from_storage").map((n) => String(n.id));
  for (const nid of gfsIds) {
    const g = await page.$(`g[data-element-id="${nid}"]`);
    if (!g) continue;
    await g.click();
    await page.waitForSelector('[data-testid="param-target_ref"]', { timeout: 10000 }).catch(() => {});
    const sel = await page.$('[data-testid="param-target_ref"]');
    if (!sel) continue;
    const cur = await sel.evaluate((n) => n.value);
    const vals = await sel.$$eval("option", (os) => os.map((o) => o.value).filter(Boolean));
    if (!cur && vals.length) {
      await sel.selectOption(vals[0]);
      await page.click('[data-testid="block-save"]');
      await page.waitForTimeout(400);
      log(`target_ref filled for ${nid}: ${vals[0]}`);
    }
  }
  await page.click('[data-testid="template-save"]');
  await page.waitForTimeout(1000);
  await shot(page, "05_next_step_recipe.png");
  await page.click('[data-testid="next-create-recipe"]');

  // 5. Рецепт: шаблон предвыбран → параметры → сохранить → «Проверить процесс»
  await page.waitForSelector('[data-testid="field-sku-id"]', { timeout: 30000 });
  await page.fill('[data-testid="field-sku-id"]', RECIPE_SKU);
  await page.waitForTimeout(800);
  const setNative = async (tid, v) => page.evaluate(([t2, val]) => {
    const el = document.querySelector(`[data-testid="${t2}"]`);
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, val);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  }, [tid, v]);
  await setNative("param-input-heat_time_sec", "90");
  await setNative("param-input-target_temp_c", "75");
  await setNative("param-input-qty", "20");
  const hp = await page.$('[data-testid="param-select-heating_power"]');
  if (hp) await hp.selectOption("medium");
  const sku = await page.$('[data-testid="param-select-dish_sku_id"]');
  if (sku) {
    const vals = await sku.$$eval("option", (os) => os.map((o) => o.value).filter(Boolean));
    if (vals.length) await sku.selectOption(vals[0]);
  }
  await shot(page, "06_recipe_preselected.png");
  await page.click('[data-testid="save-recipe"]');
  await page.waitForSelector('[data-testid="next-step-check"]', { timeout: 15000 });
  await shot(page, "07_next_check.png");
  await page.click('[data-testid="next-check-process"]');

  // 6. Проверка: автозапуск (?check=1) → панель результатов
  await page.waitForSelector('[data-testid="check-panel"]', { timeout: 30000 });
  await page.waitForTimeout(3500);
  await shot(page, "08_check_autorun.png");
  // публикация шаблона из тулбара
  const [pubTpl] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 60000 }),
    page.click('[data-testid="template-publish"]'),
  ]);
  log("template publish:", pubTpl.status(), pubTpl.status() !== 200 ? (await pubTpl.text()).slice(0, 300) : "");
  await page.waitForTimeout(1200);
  await shot(page, "09_template_published.png");

  // 7. Рецепт: публикация → «Создать пилот» в 1 клик
  await page.goto(`${BASE}/technologist/recipes`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid^="recipe-item-"]', { timeout: 30000 });
  const items = await page.$$('[data-testid^="recipe-item-"]');
  for (const it of items) {
    const text = await it.textContent();
    if (text.includes(RECIPE_SKU)) { await it.click(); break; }
  }
  await page.waitForTimeout(1000);
  const [pubRcp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 60000 }),
    page.click('[data-testid="publish-recipe"]'),
  ]);
  log("recipe publish:", pubRcp.status());
  if (pubRcp.status() !== 200) {
    log("RECIPE PUBLISH FAILED:", (await pubRcp.text()).slice(0, 300));
    throw new Error("recipe publish failed");
  }
  await page.waitForSelector('[data-testid="next-step-pilot"]', { timeout: 15000 });
  await shot(page, "10_next_pilot.png");
  await page.click('[data-testid="next-create-pilot"]');

  // 8. Пилот создан и запущен — карточка пилота
  await page.waitForSelector('[data-testid="pilot-card"]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await shot(page, "11_pilot_created.png");
  log("pilot OK");

  // 9. Финал: «Мои процессы» — шаг «Пилот»
  await page.goto(`${BASE}/technologist`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="home-table"]', { timeout: 30000 });
  await page.waitForTimeout(1000);
  await shot(page, "12_home_pilot.png");
  log("done");
} finally {
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(VIDEO_TMP).filter((f) => f.endsWith(".webm"));
  if (vids.length) fs.renameSync(path.join(VIDEO_TMP, vids[0]), path.join(OUT, "ux1_walkthrough.webm"));
  if (errors.length) console.log("pageerrors:", errors);
}
