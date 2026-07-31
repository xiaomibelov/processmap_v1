// Проверка починки: выбор ТЕКУЩЕЙ сессии из TO BE + выбор ДРУГОЙ сессии.
// Инварианты: без навигации/перезагрузки, стабильный DOM-узел рабочего места
// (нет ремаунта-моргания), целевое состояние = открытое рабочее место TO BE.
// Видео → docs/fix/tobe_current_session.webm. EXIT=0 при успехе.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.E2E_BASE || "https://stage.processmap.ru";
const OUT = path.join(ROOT, "docs", "fix");
const VIDEO_TMP = "/tmp/w4_fix_video";
const TOKEN = process.env.W4_TOKEN;
const PID = "c0494e0667";
const SID = "13f1f10b20"; // «Разогрев супа» (as_is, текущая)

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_TMP, { recursive: true, force: true });
const log = (...a) => console.log("[fix-check]", ...a);
const fail = (msg) => { throw new Error(msg); };

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  recordVideo: { dir: VIDEO_TMP, size: { width: 1680, height: 1000 } },
});
const page = await context.newPage();
await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
const consoleErrs = [];
page.on("pageerror", (e) => consoleErrs.push(String(e).slice(0, 200)));
let navCount = 0;
page.on("framenavigated", (f) => { if (f === page.mainFrame()) navCount += 1; });
const apiChurn = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.includes("/presence") || (u.includes(`/api/sessions/${SID}/bpmn`) && r.method() === "GET")) {
    apiChurn.push(`${r.method()} ${u.replace(BASE, "")}`);
  }
});

try {
  // 0. открыть as_is-сессию на хост-канвасе
  await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(12000);
  if (!(await page.$(".bjs-container"))) fail("хост-канвас не отрисовался");
  const navAfterLoad = navCount;

  // 1. сайдбар → TO BE → выбрать ТЕКУЩУЮ сессию
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
  // A6 (addendum-2): текущая сессия помечена группой «Из этого процесса»
  // (ранее — суффикс «(текущая)» в подписи строки).
  const marked = await page.evaluate((sid) => {
    const btn = document.querySelector(`[data-testid="tobe-open-${sid}"]`);
    if (!btn) return { ok: false, label: "" };
    return {
      ok: Boolean(btn.closest('[data-testid="tobe-current-process"]')) || (btn.textContent || "").includes("текущая"),
      label: (btn.textContent || "").trim(),
    };
  }, SID);
  if (!marked.ok) fail(`текущая сессия не помечена: ${marked.label}`);
  apiChurn.length = 0;
  await page.click(curBtn);

  // 2. рабочее место открылось и СТАБИЛЬНО (тот же DOM-узел, без моргания)
  await page.waitForSelector('[data-testid="session-step-bar"]', { timeout: 15000 });
  const h1 = await page.$('[data-testid="session-step-bar"]');
  await page.waitForTimeout(3000);
  const h2 = await page.$('[data-testid="session-step-bar"]');
  if (!h2) fail("рабочее место закрылось через 3с (регресс H5)");
  const sameNode = await page.evaluate(([a, b]) => a === b, [h1, h2]);
  await page.waitForTimeout(3000);
  const h3 = await page.$('[data-testid="session-step-bar"]');
  if (!h3) fail("рабочее место закрылось через 6с");
  const sameNode2 = await page.evaluate(([a, b]) => a === b, [h1, h3]);
  log("текущая сессия: stepBar стабилен 6с, тот же DOM-узел:", sameNode && sameNode2);
  if (!sameNode || !sameNode2) fail("ремаунт рабочего места (моргание)");
  if (navCount !== navAfterLoad) fail(`полная перезагрузка роута: navigations ${navAfterLoad} → ${navCount}`);
  const presenceJoin = apiChurn.filter((c) => c.startsWith("POST") && c.includes("presence")).length;
  const bpmnFetches = apiChurn.filter((c) => c.startsWith("GET") && c.includes("/bpmn")).length;
  log("network после выбора текущей:", JSON.stringify(apiChurn));
  // норма: 1×DELETE presence (cleanup при демонтаже хоста) + 1×GET bpmn (загрузка AS IS).
  // патология (баг): POST presence (хост перемонтировался) или повторные GET bpmn.
  if (presenceJoin > 0) fail(`хост-канвас перемонтировался (presence join: ${presenceJoin})`);
  if (bpmnFetches > 1) fail(`повторные загрузки bpmn: ${bpmnFetches}`);
  const asisNodes = await page.evaluate(() =>
    document.querySelectorAll('[data-testid="canvas-asis"] g[data-element-id]:not(.graph-canvas__lane)').length);
  log("AS IS узлов на канвасе:", asisNodes);
  if (asisNodes === 0) fail("AS IS не отрисован в рабочем месте");
  await page.screenshot({ path: path.join(OUT, "fix_1_current_opens_workspace.png") });

  // 3. «← К схеме» (UXF Блок 2: левая панель TO BE; ранее — tobe-close в NotesPanel) — хост-канвас обратно, стабильно
  await page.click('[data-testid="tobe-left-back"]');
  await page.waitForSelector(".bjs-container", { timeout: 15000 });
  await page.waitForTimeout(3000);
  if (await page.$('[data-testid="session-step-bar"]')) fail("TO BE переоткрылся после ручного закрытия");
  log("закрытие: хост-канвас обратно, TO BE не переоткрылся");
  await page.screenshot({ path: path.join(OUT, "fix_2_back_to_session.png") });

  // 4. выбрать ДРУГУЮ (to_be) сессию из списка → плавный вход в рабочее место
  await page.evaluate(() => {
    const acc = Array.from(document.querySelectorAll("button"))
      .find((b) => (b.textContent || "").trim().startsWith("TO BE") && (b.textContent || "").includes("Рабочее место технолога"));
    acc?.click();
  });
  await page.waitForTimeout(1200);
  const otherBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('[data-testid^="tobe-open-"]'))
      .filter((b) => !["tobe-open-blank"].includes(b.getAttribute("data-testid")));
    // A6: статус в .tobeRow__status («Открыть»); legacy — текст кнопки «Открыть TO BE …».
    const other = btns.find((b) => {
      const st = (b.querySelector(".tobeRow__status")?.textContent || "").trim();
      return st === "Открыть" || (b.textContent || "").startsWith("Открыть TO BE");
    });
    return other ? other.getAttribute("data-testid") : "";
  });
  if (!otherBtn) fail("нет другой TO BE-сессии в списке");
  const navBeforeOther = navCount;
  await page.evaluate((tid) => {
    document.querySelector(`[data-testid="${tid}"]`)?.click();
  }, otherBtn);
  await page.waitForSelector('[data-testid="session-step-bar"]', { timeout: 15000 });
  await page.waitForTimeout(3000);
  if (!(await page.$('[data-testid="session-step-bar"]'))) fail("рабочее место по другой сессии не удержалось");
  if (navCount !== navBeforeOther) fail("навигация при выборе другой сессии");
  const asisNodes2 = await page.evaluate(() =>
    document.querySelectorAll('[data-testid="canvas-asis"] g[data-element-id]:not(.graph-canvas__lane)').length);
  log("другая сессия: рабочее место открыто, AS IS узлов:", asisNodes2);
  if (asisNodes2 === 0) fail("AS IS другой сессии не отрисован");
  await page.screenshot({ path: path.join(OUT, "fix_3_other_session_workspace.png") });

  if (consoleErrs.length) log("console errors (не критично):", JSON.stringify(consoleErrs.slice(0, 4)));
  log("OK: все инварианты выполнены");
} finally {
  await context.close();
  await browser.close();
  const vids = fs.readdirSync(VIDEO_TMP).filter((f) => f.endsWith(".webm"));
  if (vids.length) fs.renameSync(path.join(VIDEO_TMP, vids[0]), path.join(OUT, "tobe_current_session.webm"));
  log("видео: docs/fix/tobe_current_session.webm");
}
