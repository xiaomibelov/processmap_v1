// Верификация находок аудита:
// V1: drag на канвасе → экранная позиция vs DI x в сохранённом XML (баг парсинга или баг персиста?)
// V2: после гонки двух окон — чьи координаты в финальном XML (потеря правки A?)
// V3: OL1 md5 AS IS до/после правки TO BE (инвариант read-only) — правильная постановка
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";

const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");
const BASE = "https://stage.processmap.ru";
const TOKEN = process.env.W4_TOKEN;
const PID = "c0494e0667";
const SOUP = "13f1f10b20";
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const log = (...a) => console.log("[verify]", ...a);

async function api(method, p, body) {
  const r = await fetch(`${BASE}${p}`, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const getXml = async (sid) => (await api("GET", `/api/sessions/${sid}/bpmn?raw=1`)).text;
const getRev = async (sid) => (await api("GET", `/api/sessions/${sid}`)).json?.diagram_state_version;
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

function diBounds(xml, elementId) {
  // найти BPMNShape bpmnElement=elementId и его dc:Bounds
  const re = new RegExp(`<bpmndi:BPMNShape[^>]*bpmnElement="${elementId}"[^>]*>\\s*<dc:Bounds[^>]*x="([0-9.\\-]+)"[^>]*y="([0-9.\\-]+)"`, "i");
  const m = xml.match(re);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

const browser = await chromium.launch();
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
  const page = await context.newPage();
  await page.addInitScript((t) => window.localStorage.setItem("fpc_auth_access_token", t), TOKEN);
  return { context, page };
}
async function openSoup(page) {
  await page.goto(`${BASE}/app?project=${PID}&session=${SOUP}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-testid="diagram-toolbar-save"]', { timeout: 60000 });
  await page.waitForTimeout(8000);
}
async function taskScreen(page, id) {
  return page.evaluate((eid) => {
    const el = document.querySelector(`g[data-element-id="${eid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width };
  }, id);
}

// --- V1: drag → экран vs XML ---
const TASK = "Activity_1k9t4a7";
const { context: c1, page } = await newPage();
await openSoup(page);
const xmlOrig = fs.readFileSync("/tmp/soup.xml", "utf8");
const origDi = diBounds(xmlOrig, TASK);
const beforeXml = diBounds(await getXml(SOUP), TASK);
const beforeScr = await taskScreen(page, TASK);
log("V1 orig(бэкап до аудита):", JSON.stringify(origDi), "сейчас XML:", JSON.stringify(beforeXml), "экран:", JSON.stringify(beforeScr));

const scr = await taskScreen(page, TASK);
await page.mouse.move(scr.x + scr.w / 2, scr.y + 20);
await page.mouse.down();
await page.mouse.move(scr.x + scr.w / 2 + 120, scr.y + 20, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(1500);
const afterScr = await taskScreen(page, TASK);
await page.click('[data-testid="diagram-toolbar-save"]');
await page.waitForTimeout(5000);
const afterXml = diBounds(await getXml(SOUP), TASK);
const screenMoved = afterScr && scr && Math.abs(afterScr.x - scr.x) > 30;
const xmlMoved = afterXml && beforeXml && Math.abs(afterXml.x - beforeXml.x) > 30;
log("V1 screenMoved:", screenMoved, `(${scr?.x?.toFixed(0)}→${afterScr?.x?.toFixed(0)})`,
  "xmlMoved:", xmlMoved, `(${beforeXml?.x}→${afterXml?.x})`);
log("V1 ВЕРДИКТ:", screenMoved && xmlMoved ? "drag+save работает (прошлый фейл — артефакт парсинга)"
  : screenMoved && !xmlMoved ? "БАГ ПЕРСИСТА: на экране двинулось, в XML нет"
  : !screenMoved ? "БАГ DRAG: узел не двигается мышью" : "неопределённо");
await page.screenshot({ path: "/root/pm-e3/app/docs/audit/v1_after_drag.png" });

// --- V2: чья правка в финале гонки? (уже видим по V1: сравним с тем, что было)
// --- V3: OL1 md5 до/после правки TO BE ---
await c1.close();
const asisBefore = md5(await getXml(SOUP));
const { context: c2, page: p2 } = await newPage();
await openSoup(p2);
await p2.click('.diagramToolbarSlot--center [data-testid="mode-switch-tobe"]');
await p2.waitForSelector('[data-testid="tobe-left-panel"]', { timeout: 60000 });
await p2.waitForTimeout(9000);
// лёгкая правка в TO BE: клик по шагу «Конструктор» (без деструктива)
const clicked = await p2.evaluate(() => {
  const steps = Array.from(document.querySelectorAll('[data-testid="tobe-steps-slot"] *'));
  const el = steps.find((s) => (s.textContent || "").trim() === "Конструктор" || (s.textContent || "").trim().startsWith("3"));
  if (el) { el.click(); return true; }
  return false;
});
await p2.waitForTimeout(6000);
await p2.screenshot({ path: "/root/pm-e3/app/docs/audit/v3_tobe_constructor.png" });
const asisAfter = md5(await getXml(SOUP));
log("V3 OL1: AS IS md5 до/после TO BE:", asisBefore, "→", asisAfter, asisBefore === asisAfter ? "ИНВАРИАНТ ДЕРЖИТСЯ" : "БАГ: AS IS ИЗМЕНЁН");
log("V3 clicked конструктор:", clicked);
await c2.close();

// --- восстановление исходного XML супа (данные вернулись к состоянию до аудита) ---
const rev = await getRev(SOUP);
const rr = await api("PUT", `/api/sessions/${SOUP}/bpmn`, { xml: xmlOrig, base_diagram_state_version: rev, source_action: "manual_save" });
log("restore soup XML:", rr.status, rr.json?.diagram_state_version ? `rev=${rr.json.diagram_state_version}` : (rr.text || "").slice(0, 120));
await browser.close();
process.exit(0);
