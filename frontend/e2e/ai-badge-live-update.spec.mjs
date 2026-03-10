import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  createFixture,
  openFixture,
  seedXml,
  selectElementOnCanvas,
  switchTab,
} from "./helpers/processFixture.mjs";

test("AI badge and marker update live without reload", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers, seedXml({ processName: `ai-live-${runId}` }));

  await page.route(/\/api\/sessions\/[^/]+\/ai\/questions$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llm_step: { status: "processed", generated: 2, reused: false },
        questions: [
          { id: `q_${runId}_1`, question: "Кто подтверждает шаг?", status: "open" },
          { id: `q_${runId}_2`, question: "Где фиксируется результат?", status: "open" },
        ],
      }),
    });
  });

  await setUiToken(page, auth.accessToken);
  await openFixture(page, fixture);

  await switchTab(page, "Diagram");
  await selectElementOnCanvas(page, "Task_1");

  await switchTab(page, "Interview");
  const firstRowAi = page.locator(".interviewStepRow").first().getByRole("button", { name: /^AI$/i });
  await expect(firstRowAi).toBeVisible();
  await firstRowAi.click();

  const aiCue = page.locator(".interviewAiCue");
  await expect(aiCue).toBeVisible();
  const checks = aiCue.locator("input[type='checkbox']");
  await expect(checks).toHaveCount(2);
  await checks.nth(0).check();
  await checks.nth(1).check();
  await aiCue.getByRole("button", { name: "Добавить к элементу" }).click();

  await switchTab(page, "Diagram");
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const node = document.querySelector('.bpmnCanvas .djs-element[data-element-id="Task_1"]');
        return node?.classList?.contains("fpcHasAiQuestion") ? 1 : 0;
      });
    }, { timeout: 20_000 })
    .toBe(1);

  const aiBadge = page.locator(".fpcNodeBadge--ai").filter({ hasText: /AI:\s*2/i }).first();
  await expect(aiBadge).toBeVisible();
});
