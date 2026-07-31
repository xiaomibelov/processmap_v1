// Воспроизведение бага: выбор ТЕКУЩЕЙ сессии из сайдбар-секции TO BE → моргание → без изменений.
// Stage, technologist-demo. Видео + консоль + network + навигации.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "fix");
const VIDEO_TMP = "/tmp/w4_repro_video";
const TOKEN = process.env.W4_TOKEN;
const PID = "c0494e0667";
const SID = "13f1f10b20"; // «Разогрев супа» (as_is)

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_TMP, { recursive: true, force: true });
const log = (...a) => console.log("[repro]", ...a);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  recordVideo: { dir: VIDEO_TMP, size: { width: 1680, height: 1000 } },
});
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);

const consoleErrs = [];
page.on("pageerror", (e) => consoleErrs.push("pageerror: " + String(e).slice(0, 250)));
page.on("console", (m) => { if (m.type() === "error") consoleErrs.push("console: " + m.text().slice(0, 250)); });
const navigations = [];
page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
const apiCalls = [];
page.on("request", (r) => { if (r.url().includes("/api/sessions")) apiCalls.push(`${r.method()} ${r.url().replace(BASE, "")}`); });

// 1. открыть as_is-сессию на хост-канвасе
await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(12000);
const hostBefore = await page.evaluate(() => ({
  hostCanvas: !!document.querySelector(".bjs-container, [data-testid='process-stage'] svg, canvas"),
  stepBar: !!document.querySelector('[data-testid="session-step-bar"]'),
  canvasTobe: !!document.querySelector('[data-testid="canvas-tobe"]'),
}));
log("host canvas перед:", JSON.stringify(hostBefore));

// 2. открыть левый сайдбар (rail → open)
await page.click('[data-testid="left-sidebar-handle"] button.leftSidebarHandleOpenBtn');
await page.waitForTimeout(1500);
// 3. раскрыть аккордеон TO BE
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  const acc = btns.find((b) => (b.textContent || "").trim().startsWith("TO BE") && (b.textContent || "").includes("Рабочее место технолога"));
  acc?.click();
});
await page.waitForTimeout(1200);
const tobeBtn = `[data-testid="tobe-open-${SID}"]`;
await page.waitForSelector(tobeBtn, { timeout: 15000 });
const btnLabel = await page.locator(tobeBtn).textContent();
log("кнопка текущей сессии:", btnLabel?.trim());
await page.screenshot({ path: path.join(OUT, "repro_1_sidebar_tobe.png") });

// 4. выбрать ТЕКУЩУЮ сессию как AS IS → наблюдать
apiCalls.length = 0;
await page.click(tobeBtn);
const timeline = [];
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({
    stepBar: !!document.querySelector('[data-testid="session-step-bar"]'),
    canvasTobe: !!document.querySelector('[data-testid="canvas-tobe"]'),
    hostCanvas: !!document.querySelector(".bjs-container"),
  }));
  timeline.push(`${i * 300}ms:${st.stepBar ? "W" : ""}${st.canvasTobe ? "T" : ""}${st.hostCanvas ? "H" : ""}${!st.stepBar && !st.canvasTobe && !st.hostCanvas ? "-" : ""}`);
}
log("таймлайн (W=workspace stepBar, T=canvas-tobe, H=host bpmn.io):");
log(timeline.join(" "));
const after = await page.evaluate(() => ({
  stepBar: !!document.querySelector('[data-testid="session-step-bar"]'),
  canvasTobe: !!document.querySelector('[data-testid="canvas-tobe"]'),
  hostCanvas: !!document.querySelector(".bjs-container"),
  url: location.href,
}));
log("состояние после:", JSON.stringify(after));
await page.screenshot({ path: path.join(OUT, "repro_2_after_click_current.png") });
log("навигации:", JSON.stringify(navigations));
log("API /api/sessions после клика:", JSON.stringify(apiCalls.slice(0, 12)));
log("console errors:", JSON.stringify(consoleErrs.slice(0, 8)));

await context.close();
await browser.close();
const vids = fs.readdirSync(VIDEO_TMP).filter((f) => f.endsWith(".webm"));
if (vids.length) fs.renameSync(path.join(VIDEO_TMP, vids[0]), path.join(OUT, "tobe_current_session_repro.webm"));
log("видео: docs/fix/tobe_current_session_repro.webm");
