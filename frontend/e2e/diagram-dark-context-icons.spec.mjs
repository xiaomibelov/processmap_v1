import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, openFixture, seedXml, selectElementOnCanvas, switchTab } from "./helpers/processFixture.mjs";

function rgbParts(rgbText) {
  const m = String(rgbText || "").match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return [0, 0, 0];
  return [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
}

test("context pad entries are readable in dark mode", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers, seedXml({ processName: `dark-icons-${runId}` }));

  await setUiToken(page, auth.accessToken);
  await openFixture(page, fixture);
  await switchTab(page, "Diagram");

  const themeBtn = page.locator('button[title="Переключить тему"]').first();
  await expect(themeBtn).toBeVisible();
  const text = String(await themeBtn.textContent() || "").trim();
  if (/^dark$/i.test(text)) {
    await themeBtn.click();
  }

  await selectElementOnCanvas(page, "Task_1");
  const entry = page.locator(".bpmnStage .djs-context-pad .entry").first();
  await expect(entry).toBeVisible();

  const styles = await page.evaluate(() => {
    const el = document.querySelector(".bpmnStage .djs-context-pad .entry");
    if (!el) return { ok: false, bg: "", icon: "" };
    const bg = getComputedStyle(el).backgroundColor;
    const icon = getComputedStyle(el, "::before").color;
    return { ok: true, bg, icon };
  });
  expect(styles.ok).toBeTruthy();

  const [bgR, bgG, bgB] = rgbParts(styles.bg);
  const [icR, icG, icB] = rgbParts(styles.icon);

  // light-ish button background + dark-ish icon foreground in dark theme
  expect(bgR).toBeGreaterThan(170);
  expect(bgG).toBeGreaterThan(170);
  expect(bgB).toBeGreaterThan(170);
  expect(icR).toBeLessThan(120);
  expect(icG).toBeLessThan(120);
  expect(icB).toBeLessThan(120);
});
