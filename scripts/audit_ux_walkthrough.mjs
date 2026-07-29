// UX-аудит: проход воркфлоу от лица технолога на stage (read-only).
// Каждый шаг — скрин + фиксация "понятно ли без инструкции".
import { createRequire } from "node:module";
const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");
import fs from "node:fs";

const OUT = "/root/pm-e3/app/docs/audit/stage";
const TOKEN = process.env.STAGE_TOKEN;
const FIXTURE = "/root/pm-e3/app/backend/tests/fixtures/itmo_razogrev_v02.bpmn";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
const shot = (n) => page.screenshot({ path: `${OUT}/ux_${n}.png` });

// 2.1 Вход: куда попадает технолог
await page.goto("https://stage.processmap.ru/app", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
await shot("2_1_landing");
console.log("[2.1] landing url:", page.url());
// есть ли кнопка «Технолог»
const techBtn = await page.$('[data-testid="topbar-technologist-button"]');
console.log("[2.1] кнопка «Технолог» в топбаре:", techBtn ? "ЕСТЬ" : "НЕТ");
if (techBtn) {
  await techBtn.click();
  await page.waitForTimeout(2500);
  await shot("2_1_technologist_entry");
  console.log("[2.1] после клика url:", page.url());
}

// 2.2 Импорт: загружаем AS IS
await page.goto("https://stage.processmap.ru/technologist/import-bpmn", { waitUntil: "networkidle", timeout: 60000 });
await page.setInputFiles('input[type="file"]', FIXTURE);
await page.click('button[type="submit"]');
await page.waitForSelector('[data-testid="import-summary"]', { timeout: 60000 });
await page.waitForTimeout(1000);
await shot("2_2_import_report");
// есть ли кнопка «Перейти к трансформации»?
const toTransform = await page.$('text=/трансформ/i');
const onlyConstructor = await page.$('button:has-text("Открыть в конструкторе")');
console.log("[2.2] кнопка «к трансформации»:", toTransform ? "ЕСТЬ" : "НЕТ", "| только «Открыть в конструкторе»:", !!onlyConstructor);

// 2.3 Трансформация
await page.goto("https://stage.processmap.ru/technologist/transform", { waitUntil: "networkidle", timeout: 60000 });
await page.setInputFiles('input[type="file"]', FIXTURE);
await page.click('button[type="submit"]');
await page.waitForSelector('[data-testid="transform-summary"]', { timeout: 120000 });
await page.waitForTimeout(1000);
await shot("2_3_transform_review");
const accepts = await page.$$(".transform-review__accept");
const questions = await page.$('text=/Открытые вопросы/');
console.log(`[2.3] решений: ${accepts.length}, блок «Открытые вопросы»: ${questions ? "ЕСТЬ" : "НЕТ"}`);
// обоснование решения — клик на первое решение
const firstDecision = await page.$(".transform-review__decision-main");
if (firstDecision) { await firstDecision.click(); await page.waitForTimeout(600); await shot("2_3_decision_detail"); }

// 2.4 Конструктор (handoff, БЕЗ сохранения — read-only)
await page.click(".transform-review__to-constructor");
await page.waitForSelector('[data-testid="template-save"]', { timeout: 30000 });
await page.waitForTimeout(1500);
await shot("2_4_constructor_handoff");
const notice = await page.$('[data-testid="ctor-notice"]');
console.log("[2.4] handoff notice:", notice ? await notice.textContent() : "нет");
// next-step подсказка после сохранения? (не сохраняем — read-only)

// 2.5 Рецепты — пустое состояние
await page.goto("https://stage.processmap.ru/technologist/recipes", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
await shot("2_5_recipes_empty");

// 2.6 Пилоты — пустое состояние
await page.goto("https://stage.processmap.ru/technologist/pilots", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
await shot("2_6_pilots_empty");

// 2.7 Навигация: есть ли визард/чек-лист?
const wizard = await page.$('text=/шаг [0-9]|шаг из|wizard|чек-лист/i');
console.log("[2.7] визард/чек-лист процесса:", wizard ? "ЕСТЬ" : "НЕТ");

await browser.close();
console.log("done");
