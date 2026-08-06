// Z0 after-скрины + замеры контрастов на stage (после мержа #688, stage@47b5dcf2).
// «До» — docs/ux/audit/tobe_00/02 (аудит). Артефакты → docs/ux/audit/z0_after_*.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire("/root/node_modules/");
const { chromium } = require("playwright");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs", "ux", "audit");
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[z0-after]", ...a);

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

await page.screenshot({ path: path.join(OUT, "z0_after_00_workspace.png"), fullPage: false });
log("z0_after_00_workspace.png");

// вкладка «Замечания»
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button, [role=tab], a")).find((x) => (x.textContent || "").trim() === "Замечания");
  b?.click();
});
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT, "z0_after_01_remarks.png"), fullPage: false });
log("z0_after_01_remarks.png");

const probe = await page.evaluate(() => {
  const out = {};
  const card = document.querySelector(".ctor-check__finding");
  if (card) {
    const cs = getComputedStyle(card);
    out.finding = { color: cs.color, bg: cs.backgroundColor, text: (card.textContent || "").trim().slice(0, 60) };
  }
  const pending = document.querySelector(".wfbar__step--pending, .tobeSteps__item--pending");
  if (pending) {
    const ps = getComputedStyle(pending);
    out.stepPending = { color: ps.color, opacity: ps.opacity };
  }
  const na = document.querySelector(".wfbar__step--na, .tobeSteps__item--na");
  if (na) out.stepNa = { color: getComputedStyle(na).color, opacity: getComputedStyle(na).opacity };
  const disabledBtn = Array.from(document.querySelectorAll("button.ctor-btn, .ws__toolbar button"))
    .find((b) => b.disabled);
  if (disabledBtn) {
    const ds = getComputedStyle(disabledBtn);
    out.disabledBtn = { text: (disabledBtn.textContent || "").trim().slice(0, 30), color: ds.color, bg: ds.backgroundColor, opacity: ds.opacity };
  }
  const layerBtns = Array.from(document.querySelectorAll(".ws__layer-btn"));
  if (layerBtns.length) {
    out.layerBtns = layerBtns.map((b) => {
      const cs = getComputedStyle(b);
      return { text: (b.textContent || "").trim().slice(0, 30), color: cs.color, bg: cs.backgroundColor, opacity: cs.opacity };
    });
  }
  return out;
});
log(JSON.stringify(probe, null, 1));
fs.writeFileSync(path.join(OUT, "z0_after_probe.json"), JSON.stringify(probe, null, 2));
await browser.close();
log("DONE");
