import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, openFixture, renameTask, seedXml, switchTab } from "./helpers/processFixture.mjs";

test("diagram autosave survives hard refresh and stays synced with interview", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const nextLabel = `AutoSave ${runId.slice(-6)}`;
  const fixture = await createFixture(request, runId, auth.headers, seedXml({ processName: `autosave-${runId}` }));

  await setUiToken(page, auth.accessToken);
  await openFixture(page, fixture);
  await switchTab(page, "Diagram");

  await renameTask(page, "Task_1", nextLabel);

  await expect
    .poll(async () => {
      const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn?raw=1`, {
        headers: auth.headers,
      });
      const xml = await res.text();
      return xml.includes(nextLabel) ? 1 : 0;
    }, { timeout: 30_000 })
    .toBe(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await openFixture(page, fixture);
  await switchTab(page, "Diagram");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return "";
        const el = modeler.get("elementRegistry")?.get("Task_1");
        return String(el?.businessObject?.name || "");
      });
    }, { timeout: 20_000 })
    .toBe(nextLabel);

  await switchTab(page, "Interview");
  await expect(page.locator(".processStage")).toContainText(nextLabel, { timeout: 20_000 });
});
