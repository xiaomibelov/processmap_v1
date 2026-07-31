// UXF — репродукция багов B1/B3/B5 на stage (пустая AS IS).
// Пустая сессия → TO BE: жёлтая плашка, мёртвая кнопка, step-bar весь синий.
// Доказательства → docs/uxf/before_*.png; сетевой лог клика по «Перейти к трансформации».
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.E2E_BASE || "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "uxf");
const TOKEN = process.env.W4_TOKEN;
const PID = "c0494e0667";
const SID = process.env.UXF_EMPTY_SID || "e790842747"; // «UXF probe empty AS IS» (пустая)
const PREFIX = process.env.UXF_PREFIX || "before";

fs.mkdirSync(OUT, { recursive: true });
const shot = (page, n) => page.screenshot({ path: path.join(OUT, `${PREFIX}_${n}.png`) });
const log = (...a) => console.log("[uxf-repro]", ...a);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
page.on("pageerror", (e) => console.log("[uxf-repro] pageerror:", String(e).slice(0, 200)));
const apiLog = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.includes("/api/")) apiLog.push(`${r.method()} ${u.replace(BASE, "")}`);
});

try {
  // 1. открыть пустую сессию на хост-канвасе
  await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(10000);
  log("хост-канвас (.bjs-container):", Boolean(await page.$(".bjs-container")));

  // 2. сайдбар → TO BE → текущая сессия
  await page.click('[data-testid="left-sidebar-handle"] button.leftSidebarHandleOpenBtn');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const acc = Array.from(document.querySelectorAll("button"))
      .find((b) => (b.textContent || "").trim().startsWith("TO BE") && (b.textContent || "").includes("Рабочее место технолога"));
    acc?.click();
  });
  await page.waitForTimeout(1200);
  const curBtn = `[data-testid="tobe-open-${SID}"]`;
  await page.waitForSelector(curBtn, { timeout: 15000 });
  await shot(page, "1_sidebar_tobe_list");
  await page.click(curBtn);

  // 3. рабочее место: плашка, канвас, step-bar
  await page.waitForSelector('[data-testid="session-step-bar"]', { timeout: 15000 });
  await page.waitForTimeout(6000); // ждём загрузку AS IS (пустую)
  const state = await page.evaluate(() => {
    const txt = (el) => (el ? (el.textContent || "").trim().slice(0, 120) : null);
    const notice = document.querySelector(".ws__notice, .notice, [class*='notice']");
    const steps = Array.from(document.querySelectorAll("[data-testid^='session-step-']"))
      .filter((el) => el.getAttribute("data-testid") !== "session-step-bar")
      .map((el) => ({
        id: el.getAttribute("data-testid"),
        state: el.getAttribute("data-state"),
        current: el.className.includes("--current"),
        done: el.className.includes("--done"),
      }));
    const action = document.querySelector('[data-testid="ws-action"]');
    return {
      notice: txt(notice),
      asisNodes: document.querySelectorAll('[data-layer="asis"] [data-element-id]').length,
      tobeNodes: document.querySelectorAll('[data-layer="tobe"] [data-element-id]').length,
      overlay: Boolean(document.querySelector(".graph-canvas--overlay")),
      actionLabel: txt(action),
      actionDisabled: action ? action.disabled : null,
      steps,
    };
  });
  log("состояние рабочего места:", JSON.stringify(state, null, 1));
  await shot(page, "2_workspace_empty");

  // 4. клик по главному действию («Перейти к трансформации») — фиксируем сеть и реакцию
  apiLog.length = 0;
  await page.click('[data-testid="ws-action"]');
  await page.waitForTimeout(4000);
  const after = await page.evaluate(() => ({
    notice: (document.querySelector(".ws__notice, .notice, [class*='notice']")?.textContent || "").trim().slice(0, 120),
    tobeNodes: document.querySelectorAll('[data-layer="tobe"] [data-element-id]').length,
    badges: document.querySelectorAll(".graph-canvas__badge").length,
  }));
  log("сеть после клика:", JSON.stringify(apiLog));
  log("после клика:", JSON.stringify(after));
  await shot(page, "3_after_transform_click");

  log("REPRO DONE");
} finally {
  await browser.close();
}
