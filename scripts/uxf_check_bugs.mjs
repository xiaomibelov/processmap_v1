// UXF — приёмочная проверка фиксов B1/B3/B4/B5 (после фикса).
// Прогон против ЛОКАЛЬНОГО build с новым кодом + stage API (данные stage).
// Ветка 1 (пустая AS IS): transform disabled + «с чистого листа», step-bar
// current/pending, пустое состояние → чистый лист → приглашение в каталог.
// Ветка 2 (AS IS есть): «Перейти к трансформации» → 200 + решения.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.UXF_BASE || "http://127.0.0.1:5199";
const OUT = path.join(ROOT, "docs", "uxf");
const TOKEN = process.env.W4_TOKEN;
const PID = "c0494e0667"; // проект на РЕАЛЬНОМ stage (stage.processmap.ru)
const EMPTY_SID = process.env.UXF_EMPTY_SID || "e790842747"; // «UXF probe empty AS IS»
const SOUP_SID = "13f1f10b20"; // «Разогрев супа» — непустая AS IS
const PREFIX = process.env.UXF_PREFIX || "after";

fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[uxf-check]", ...a);
const fail = (m) => { throw new Error(m); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
page.on("pageerror", (e) => console.log("[uxf-check] pageerror:", String(e).slice(0, 200)));
const shot = (n) => page.screenshot({ path: path.join(OUT, `${PREFIX}_${n}.png`) });

async function openSession(sid) {
  await page.goto(`${BASE}/app?project=${PID}&session=${sid}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(9000);
  // сайдбар может быть уже открыт (persist state) — кликаем handle только если есть
  const handle = await page.$('[data-testid="left-sidebar-handle"] button.leftSidebarHandleOpenBtn');
  if (handle) {
    await handle.click();
    await page.waitForTimeout(1200);
  }
  await page.evaluate(() => {
    const acc = Array.from(document.querySelectorAll("button"))
      .find((b) => (b.textContent || "").trim().startsWith("TO BE") && (b.textContent || "").includes("Рабочее место технолога"));
    acc?.click();
  });
  await page.waitForTimeout(1000);
}

async function clickTobeOpen(sid) {
  await page.waitForSelector(`[data-testid="tobe-open-${sid}"]`, { timeout: 15000 });
  // клик через DOM: sticky-заголовок аккордеона может перекрывать кнопку
  await page.evaluate((id) => {
    document.querySelector(`[data-testid="tobe-open-${id}"]`)?.click();
  }, sid);
  await page.waitForSelector('[data-testid="session-step-bar"]', { timeout: 15000 });
  await page.waitForTimeout(5000);
}

const stepVisuals = () => page.evaluate(() =>
  Array.from(document.querySelectorAll("[data-testid^='session-step-']"))
    .filter((el) => el.getAttribute("data-testid") !== "session-step-bar")
    .map((el) => `${el.getAttribute("data-testid").replace("session-step-", "")}:${el.getAttribute("data-visual")}`));

try {
  // ---- ВЕТКА 1: пустая AS IS ----
  await openSession(EMPTY_SID);

  // B4: список источников — статусы + фильтр служебных (ДО входа в рабочее место)
  const listState = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("[data-testid^='tobe-open-']"));
    return {
      statuses: btns.slice(0, 8).map((b) => (b.textContent || "").trim().slice(0, 55)),
      withStatus: btns.filter((b) => /^(Открыть|Создать) TO BE/.test((b.textContent || "").trim())).length,
      total: btns.length,
      other: Boolean(document.querySelector('[data-testid="tobe-other"]')),
    };
  });
  log("B4 список:", JSON.stringify(listState));
  if (!listState.withStatus) fail("B4: нет статусов Создать/Открыть в списке источников");
  await shot("1_tobe_list_statuses");

  await clickTobeOpen(EMPTY_SID);

  // B1: transform disabled + причина, главное действие — «с чистого листа»
  const actionState = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="ws-action"]');
    const d = document.querySelector('[data-testid="ws-transform-disabled"]');
    return {
      action: (a?.textContent || "").trim(),
      disabledShown: Boolean(d),
      disabledTitle: d?.getAttribute("title") || "",
      empty: Boolean(document.querySelector('[data-testid="ws-empty"]')),
      blankStart: Boolean(document.querySelector('[data-testid="ws-blank-start"]')),
    };
  });
  log("B1 состояние:", JSON.stringify(actionState));
  if (!actionState.disabledShown || !actionState.disabledTitle) fail("B1: transform не disabled с причиной");
  if (!/чистого листа/.test(actionState.action)) fail(`B1: главное действие не «с чистого листа»: ${actionState.action}`);
  if (!actionState.empty || !actionState.blankStart) fail("B5: нет пустого состояния с действием");
  await shot("2_empty_asis_disabled_transform");

  // B3: step-bar — первый current, остальные pending
  let visuals = await stepVisuals();
  log("B3 step-bar (пустая):", JSON.stringify(visuals));
  if (visuals[0] !== "import:current") fail(`B3: первый шаг не current: ${visuals[0]}`);
  if (!visuals.slice(1).every((v) => v.endsWith(":pending"))) fail(`B3: не все остальные pending: ${visuals}`);

  // B1: клик по главному действию → чистый лист → приглашение в каталог
  await page.click('[data-testid="ws-action"]');
  await page.waitForTimeout(1500);
  const blankState = await page.evaluate(() => ({
    empty: Boolean(document.querySelector('[data-testid="ws-empty"]')),
    paletteCta: Boolean(document.querySelector('[data-testid="ws-empty-palette"]')),
    hint: (document.querySelector(".ws__empty-hint")?.textContent || "").trim().slice(0, 80),
  }));
  log("B5 после «с чистого листа»:", JSON.stringify(blankState));
  if (!blankState.empty || !blankState.paletteCta) fail("B5: после чистого листа нет приглашения в каталог");
  visuals = await stepVisuals();
  log("B3 step-bar (чистый лист):", JSON.stringify(visuals));
  if (visuals[0] !== "import:na") fail(`B3: import не na после чистого листа: ${visuals[0]}`);
  if (visuals[1] !== "transform:na") fail(`B3: transform не na после чистого листа: ${visuals[1]}`);
  if (visuals[2] !== "constructor:current") fail(`B3: constructor не current после чистого листа: ${visuals[2]}`);
  await shot("3_blank_state_palette_cta");

  // ---- ВЕТКА 2: AS IS есть — трансформация работает ----
  await openSession(SOUP_SID);
  await clickTobeOpen(SOUP_SID);
  const transformLabel = await page.evaluate(() => (document.querySelector('[data-testid="ws-action"]')?.textContent || "").trim());
  if (!/трансформац/i.test(transformLabel)) fail(`B1: на непустой AS IS действие не трансформация: ${transformLabel}`);
  const transformReq = page.waitForRequest((r) => r.url().includes("transform-asis") && r.method() === "POST", { timeout: 30000 });
  const transformResp = page.waitForResponse((r) => r.url().includes("transform-asis") && r.request().method() === "POST", { timeout: 30000 });
  await page.click('[data-testid="ws-action"]');
  await transformReq;
  const resp = await transformResp;
  await page.waitForTimeout(4000);
  const after2 = await page.evaluate(() => ({
    badges: document.querySelectorAll(".graph-canvas__badge").length,
    tobeNodes: document.querySelectorAll('[data-layer="tobe"] [data-element-id]').length,
    disabledBtn: Boolean(document.querySelector('[data-testid="ws-transform-disabled"]')),
  }));
  log("B1 ветка 2: HTTP", resp.status(), JSON.stringify(after2));
  if (resp.status() !== 200) fail(`B1: трансформация не 200: ${resp.status()}`);
  if (!after2.badges) fail("B1: нет бейджей решений после трансформации");
  if (after2.disabledBtn) fail("B1: disabled-кнопка показана на непустой AS IS");
  const visuals2 = await stepVisuals();
  log("B3 step-bar (после трансформации):", JSON.stringify(visuals2));
  await shot("4_transform_ok");

  log("OK: B1 (обе ветки), B3, B4, B5 — подтверждены");
} finally {
  await browser.close();
}
