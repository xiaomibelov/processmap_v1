// Дозамер: цвета текста карточек замечаний + высоты зон (факты P1/P2).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs", "ux", "audit");

const res = await fetch("https://stage.processmap.ru/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "d.belov@automacon.ru", password: "Beelive12!" }),
});
const TOKEN = (await res.json()).access_token;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1000 } })).newPage();
await page.addInitScript(({ t, org }) => {
  window.localStorage.setItem("fpc_auth_access_token", t);
  window.localStorage.setItem("fpc_active_org_id", org);
  window.sessionStorage.setItem("fpc_org_choice_done:389893aa9e1e4823aa9b0f4498817655", "1");
}, { t: TOKEN, org: "8b89c83ea810" });
await page.goto("https://stage.processmap.ru/app?project=9f4c3f90be&session=1d3f7de3fa", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(14000);

const probe = await page.evaluate(() => {
  const out = {};
  // P1: высоты зон
  const wsMain = document.querySelector(".ws__main") || document.querySelector(".ws");
  const svg = document.querySelector("svg.graph-canvas, .import-bpmn__svg");
  const canvases = document.querySelector(".ws__canvases");
  const rect = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { y: Math.round(r.y), h: Math.round(r.height) }; })() : null;
  out.p1_zones = {
    viewportH: window.innerHeight,
    wsMain: rect(wsMain),
    canvases: rect(canvases),
    svg: rect(svg),
    svgMaxHeight: svg ? getComputedStyle(svg).maxHeight : null,
    svgViewBox: svg?.getAttribute("viewBox") || null,
  };
  // P2: цвета карточек замечаний
  const card = document.querySelector(".ctor-check__finding, .ctor-check__findings-list li");
  if (card) {
    const cs = getComputedStyle(card);
    const child = card.querySelector("*");
    const ccs = child ? getComputedStyle(child) : null;
    out.p2_card = {
      cls: card.className.slice(0, 60),
      color: cs.color, bg: cs.backgroundColor,
      childColor: ccs?.color, childBg: ccs?.backgroundColor,
      text: (card.textContent || "").trim().slice(0, 100),
    };
  } else out.p2_card = { error: "no finding card" };
  // P2: есть ли severity-классы у import-findings
  const importItems = Array.from(document.querySelectorAll(".ctor-check__findings-list li, .ctor-check__findings-list .ctor-check__finding"));
  out.p2_importFindings = {
    count: importItems.length,
    withSeverityClass: importItems.filter((el) => /--error|--warning/.test(el.className)).length,
  };
  // P5: эффективный контраст pending-шага (цвет × opacity на фоне бара)
  const pending = document.querySelector(".wfbar__step--pending, .tobeSteps__item--pending");
  const bar = document.querySelector(".wfbar") || document.querySelector(".tobeSteps");
  if (pending && bar) {
    const ps = getComputedStyle(pending), bs = getComputedStyle(bar);
    out.p5_pending = {
      textColor: ps.color, opacity: ps.opacity, barBg: bs.backgroundColor,
      note: "эффективный цвет = textColor × opacity на barBg",
    };
  }
  return out;
});
console.log(JSON.stringify(probe, null, 2));
fs.writeFileSync(path.join(OUT, "tobe_audit_probe2.json"), JSON.stringify(probe, null, 2));
await browser.close();
