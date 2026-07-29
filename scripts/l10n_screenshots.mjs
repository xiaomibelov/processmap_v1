// L10N — скриншоты всех экранов роли technologist на русском (docs/l10n/).
// Запуск: NODE_PATH=/root/node_modules node scripts/l10n_screenshots.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs", "l10n");
const VITE = "http://127.0.0.1:15177";

const token = execSync(
  `${path.join(ROOT, ".venv/bin/python")} -c "import sys; sys.path.insert(0,'.'); from backend.app.auth import create_access_token; print(create_access_token('ddd6f7ab469e4218afa4a3424578278d'))"`,
  { cwd: ROOT },
).toString().trim();

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });
const log = (...a) => console.log("[l10n]", ...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), token);

// 1. Каталог: русские имена операций + карточка
await page.goto(`${VITE}/technologist/catalog`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="catalog-op-transfer"]', { timeout: 30000 });
await shot(page, "screen_catalog.png");
await page.click('[data-testid="catalog-op-transfer"]');
await page.waitForSelector('[data-testid="catalog-details"]', { timeout: 15000 });
await shot(page, "screen_catalog_details.png");
log("catalog OK");

// 2. Конструктор + панель «Проверить» (findings message RU, код мелким)
const TPL = "cafe1633-fa48-4a76-ba33-c3a262978e78"; // Супы РТК MVP (опубликован)
await page.goto(`${VITE}/technologist/constructor?template=${TPL}`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="template-new-draft"]', { timeout: 30000 });
await shot(page, "screen_constructor_published.png");
await page.click('button:has-text("Проверить")');
await page.waitForSelector('[data-testid="check-panel"]', { timeout: 15000 });
await page.waitForTimeout(3000);
await shot(page, "screen_check_panel.png");
log("constructor OK");

// 3. Рецепты: ошибка 1000 сек на русском
await page.goto(`${VITE}/technologist/recipes`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="new-recipe"]', { timeout: 30000 });
await page.click('[data-testid="new-recipe"]');
await page.fill('[data-testid="field-sku-id"]', "l10n_probe");
const tplOpts = await page.$$eval('[data-testid="field-template"] option', (os) => os.map((o) => o.value).filter(Boolean));
await page.selectOption('[data-testid="field-template"]', tplOpts[0]);
await page.waitForTimeout(800);
const setNative = async (testid, value) => {
  await page.evaluate(([tid, v]) => {
    const el = document.querySelector(`[data-testid="${tid}"]`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, [testid, value]);
};
await setNative("param-input-heat_time_sec", "1000");
await page.click('[data-testid="save-recipe"]');
await page.waitForSelector('[data-testid="form-errors"]', { timeout: 15000 });
await page.waitForTimeout(400);
await shot(page, "screen_recipe_error_1000.png");
log("recipe 422 OK");

// 4. История рецепта (русские даты, цепочка)
const recipes = await (await fetch(`${VITE}/api/recipes`, { headers: { Authorization: `Bearer ${token}` } })).json();
const borsch = recipes.find((r) => r.sku_id === "borsch_mvp" && r.status === "published");
await page.click(`[data-testid="recipe-item-${borsch.id}"]`);
await page.waitForTimeout(1000);
await page.click('[data-testid="tab-history"]');
await page.waitForSelector('[data-testid="history-tab"] [data-testid="audit-list"]', { timeout: 30000 });
await page.waitForTimeout(800);
await shot(page, "screen_recipe_history.png");
log("history OK");

// 5. Пилоты
await page.goto(`${VITE}/technologist/pilots`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="pilots-list"]', { timeout: 30000 });
await page.waitForTimeout(1000);
const items = await page.$$('[data-testid^="binding-item-"]');
if (items.length) await items[0].click();
await page.waitForTimeout(1200);
await shot(page, "screen_pilots.png");
log("pilots OK");

// 6. Аудит (страница с фильтрами)
await page.goto(`${VITE}/technologist/audit`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="audit-filters"]', { timeout: 30000 });
await page.waitForTimeout(1200);
await shot(page, "screen_audit.png");
log("audit OK");

// 7. Импорт
await page.goto(`${VITE}/technologist/import-bpmn`, { waitUntil: "networkidle" });
await page.waitForSelector('input[type="file"]', { timeout: 30000 });
await page.setInputFiles('input[type="file"]', path.join(ROOT, "backend/tests/fixtures/itmo_razogrev_v02.bpmn"));
await page.click('button[type="submit"]');
await page.waitForSelector('[data-testid="import-summary"]', { timeout: 30000 });
await page.waitForTimeout(800);
await shot(page, "screen_import.png");
log("import OK");

// 8. Трансформация
await page.goto(`${VITE}/technologist/transform`, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', path.join(ROOT, "backend/tests/fixtures/itmo_razogrev_v02.bpmn"));
await page.click('button[type="submit"]');
await page.waitForSelector('[data-testid="transform-summary"]', { timeout: 120000 });
await page.waitForTimeout(800);
await shot(page, "screen_transform.png");
log("transform OK");

// 9. rollout до критерия — 409 на русском (через карточку пилота)
await page.goto(`${VITE}/technologist/pilots`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="pilots-list"]', { timeout: 30000 });
await page.waitForTimeout(1000);
const pilotItems = await page.$$('[data-testid^="binding-item-"]');
let clicked = false;
for (const it of pilotItems) {
  const badge = await it.$eval('[data-testid^="binding-status-"]', (el) => el.textContent).catch(() => "");
  if (badge.includes("Пилот")) { await it.click(); clicked = true; break; }
}
if (clicked) {
  await page.waitForSelector('[data-testid="rollout-button"]', { timeout: 15000 });
  const btn = page.locator('[data-testid="rollout-button"]');
  if (await btn.isDisabled()) {
    await shot(page, "screen_rollout_blocked.png");
    log("rollout blocked (disabled + reason) OK");
  } else {
    await btn.click();
    await page.waitForSelector('[data-testid="pilots-error"]', { timeout: 15000 });
    await shot(page, "screen_rollout_blocked.png");
    log("rollout 409 OK");
  }
} else {
  log("no pilot binding — rollout screen skipped");
}

await browser.close();
log("done");
