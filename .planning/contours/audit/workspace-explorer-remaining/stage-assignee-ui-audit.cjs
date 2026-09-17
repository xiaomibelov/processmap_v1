const { chromium } = require("playwright");
const fs = require("fs");

const outDir = "/ws/.planning/contours/audit/workspace-explorer-remaining/screenshots";

async function measure(page) {
  return page.evaluate(() => {
    const c = document.querySelector('[data-testid="explorer-table-container"]');
    return {
      url: location.href,
      scrollTop: c ? c.scrollTop : null,
      expanded: Array.from(document.querySelectorAll('button[aria-label^="Скрыть"],button[aria-label^="Показать"]'))
        .map((b) => b.getAttribute("aria-label"))
        .slice(0, 30),
      text: document.body.innerText.slice(0, 5000),
    };
  });
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/ms-playwright/chromium-1208/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const events = { console: [], network: [], measures: {} };
  page.on("console", (msg) => events.console.push({ type: msg.type(), text: msg.text() }));
  page.on("response", async (resp) => {
    const url = resp.url();
    if (!url.includes("/api/")) return;
    let body = "";
    if (url.includes("assignees") || resp.status() >= 400) {
      try {
        body = (await resp.text()).slice(0, 1000);
      } catch {
        body = "";
      }
    }
    events.network.push({ method: resp.request().method(), url, status: resp.status(), body });
  });

  await page.goto("https://stage.processmap.ru/app", { waitUntil: "networkidle" });
  const emailInput = page.locator("input").first();
  try {
    await emailInput.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    // Already authenticated.
  }
  if (await emailInput.count()) {
    await emailInput.fill(process.env.STAGE_EMAIL || "");
    await page.locator("input").nth(1).fill(process.env.STAGE_PASSWORD || "");
    await page.getByRole("button", { name: /войти/i }).click();
    await page.waitForLoadState("networkidle");
  }
  await page.evaluate(() => {
    window.localStorage.setItem("fpc_active_org_id", "8b89c83ea810");
    window.sessionStorage.setItem("fpc_org_choice_done:389893aa9e1e4823aa9b0f4498817655", "1");
  });
  await page.goto("https://stage.processmap.ru/app", { waitUntil: "networkidle" });
  const org = page.locator('button:has-text("Роботизация производств")').first();
  if (await org.count()) {
    await org.click();
    await page.waitForLoadState("networkidle");
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/assignee-ui-before.png`, fullPage: true });
  events.measures.before = await measure(page);

  const assignLocator = page.locator('button[title="Назначить исполнителя"]');
  events.measures.assignButtonCount = await assignLocator.count();
  if (events.measures.assignButtonCount > 0) {
    const assign = assignLocator.first();
    await assign.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${outDir}/assignee-ui-before-click.png`, fullPage: true });
    await assign.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/assignee-dialog-open.png`, fullPage: true });
    const checks = page.locator('input[type="checkbox"]');
    events.measures.checkboxCount = await checks.count();
    if (events.measures.checkboxCount >= 2) {
      await checks.nth(0).check();
      await checks.nth(1).check();
    } else if (events.measures.checkboxCount === 1) {
      await checks.nth(0).check();
    }
    await page.screenshot({ path: `${outDir}/assignee-dialog-selected.png`, fullPage: true });
    await page.getByRole("button", { name: /сохранить/i }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outDir}/assignee-ui-after-save-error.png`, fullPage: true });
  }
  events.measures.after = await measure(page);
  fs.writeFileSync(
    "/ws/.planning/contours/audit/workspace-explorer-remaining/assignee-ui-events.sanitized.json",
    JSON.stringify(events, null, 2),
  );
  await browser.close();
  console.log(
    "done",
    events.measures.assignButtonCount,
    events.network.filter((e) => e.url.includes("assignees")).map((e) => `${e.method} ${e.status}`).join(","),
  );
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
