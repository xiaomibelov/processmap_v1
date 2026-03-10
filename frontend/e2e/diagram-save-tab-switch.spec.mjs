import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, openFixture, renameTask, seedXml, switchTab } from "./helpers/processFixture.mjs";

test("diagram change is saved and projected when switching to interview", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const nextLabel = `SwitchSync ${runId.slice(-6)}`;
  const fixture = await createFixture(request, runId, auth.headers, seedXml({ processName: `tabs-${runId}` }));

  await setUiToken(page, auth.accessToken);
  await openFixture(page, fixture);

  await switchTab(page, "Diagram");
  await renameTask(page, "Task_1", nextLabel);

  await switchTab(page, "Interview");
  await expect(page.locator(".processStage")).toContainText(nextLabel, { timeout: 20_000 });

  await expect
    .poll(async () => {
      const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn?raw=1`, {
        headers: auth.headers,
      });
      const xml = await res.text();
      return xml.includes(nextLabel) ? 1 : 0;
    }, { timeout: 30_000 })
    .toBe(1);
});
