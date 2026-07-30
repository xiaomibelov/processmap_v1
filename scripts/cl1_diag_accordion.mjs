// CL1 диагностика аккордеона TO BE: реальные mouse-клики (не DOM), консоль.
import { createRequire } from "node:module";
const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");
import fs from "node:fs";

const OUT = "/root/pm-e3/app/docs/cl1";
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.CL1_BASE || "https://stage.processmap.ru";
const USERS = [
  ["technologist", "technologist-demo@local", "technologist-demo"],
  ["owner", "d.belov@automacon.ru", "Beelive12!"],
];
const PID = process.env.CL1_PID || "c0494e0667";
const SID = process.env.CL1_SID || "13f1f10b20";

async function login(user, pwd) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user, password: pwd }),
  });
  return (await r.json()).access_token;
}

const browser = await chromium.launch();
for (const [name, email, pwd] of USERS) {
  const token = await login(email, pwd);
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  const consoleMsgs = [];
  page.on("console", (m) => m.type() === "error" && consoleMsgs.push(m.text().slice(0, 250)));
  page.on("pageerror", (e) => consoleMsgs.push("PAGEERROR: " + String(e).slice(0, 250)));
  await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), token);
  await page.goto(`${BASE}/app?project=${PID}&session=${SID}`, {
    waitUntil: "domcontentloaded", timeout: 90000,
  });
  await page.waitForTimeout(6000);
  // org chooser (владелец) → Default; rail сайдбара → развернуть
  const orgBtn = await page.$('button:has-text("Default")');
  if (orgBtn) {
    const box = await orgBtn.boundingBox();
    if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(4000); }
  }
  const rail = await page.$('[data-testid="left-sidebar-handle"] .leftSidebarHandleOpenBtn');
  if (rail) {
    const rb = await rail.boundingBox();
    if (rb) { await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2); await page.waitForTimeout(1500); }
  }

  // что на месте клика: состояние секции + elementFromPoint по центру заголовка
  const probe = await page.evaluate(() => {
    const section = document.querySelector('[data-section-id="tobe"]');
    const head = section?.querySelector(".sidebarAccordionHead");
    const body = section?.querySelector('[data-testid="tobe-section"]');
    const result = {
      sectionExists: !!section,
      ariaExpanded: head?.getAttribute("aria-expanded") || null,
      bodyVisible: body ? !!(body.offsetWidth || body.offsetHeight) : false,
      sessionsCount: body ? body.querySelectorAll("button").length : -1,
      headRect: null,
      coverElement: null,
      sectionClasses: section?.className || null,
    };
    if (head) {
      const r = head.getBoundingClientRect();
      result.headRect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const cover = document.elementFromPoint(cx, cy);
      result.coverElement = cover
        ? `${cover.tagName}.${String(cover.className || "").slice(0, 60)}`
        : "none";
      result.coverIsHead = cover === head || head.contains(cover);
    }
    return result;
  });
  console.log(`[${name}] probe:`, JSON.stringify(probe, null, 1));

  // РЕАЛЬНЫЙ клик мышью по центру заголовка аккордеона
  if (probe.headRect) {
    const cx = probe.headRect.x + probe.headRect.w / 2;
    const cy = probe.headRect.y + probe.headRect.h / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(1200);
  }
  const after = await page.evaluate(() => {
    const head = document.querySelector('[data-section-id="tobe"] .sidebarAccordionHead');
    const body = document.querySelector('[data-testid="tobe-section"]');
    return {
      ariaExpanded: head?.getAttribute("aria-expanded") || null,
      bodyVisible: body ? !!(body.offsetWidth || body.offsetHeight) : false,
      buttons: body ? body.querySelectorAll("button").length : -1,
      buttonsText: body ? Array.from(body.querySelectorAll("button")).map((b) => b.textContent.trim().slice(0, 50)) : [],
    };
  });
  console.log(`[${name}] after real click:`, JSON.stringify(after, null, 1));
  await page.screenshot({ path: `${OUT}/diag_${name}_after_click.png` });
  console.log(`[${name}] console errors:`, consoleMsgs.length ? consoleMsgs : "нет");
  await page.close();
}
await browser.close();
console.log("done");
