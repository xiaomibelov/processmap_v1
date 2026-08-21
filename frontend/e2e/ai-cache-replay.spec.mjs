import { expect, test } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

async function apiJson(res, opLabel) {
  const txt = await res.text();
  let body = {};
  try {
    body = txt ? JSON.parse(txt) : {};
  } catch {
    body = { raw: txt };
  }
  expect(res.ok(), `${opLabel}: ${txt}`).toBeTruthy();
  return body;
}

async function createProjectOnly(request, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E AI cache project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");
  return { projectId };
}

test("AI cache replay: при повторном fail возвращается last-good cached", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createProjectOnly(request, runId);

  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_debug_ai", "1");
  });

  let aiCalls = 0;
  await page.route(/\/api\/llm\/session-title\/questions$/, async (route) => {
    aiCalls += 1;
    if (aiCalls === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          questions: [
            {
              id: "Q1",
              block: "A",
              question: "Что считается готовым результатом процесса?",
              ask_to: "технолог",
              answer_type: "коротко",
              follow_up: "По каким измеримым критериям?",
            },
            {
              id: "Q2",
              block: "C",
              question: "Кто отвечает за запуск и кто за финальную проверку?",
              ask_to: "мастер смены",
              answer_type: "список",
              follow_up: "Кто замещает при отсутствии?",
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "forced ai fail" }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.getByRole("button", { name: "Обновить" }).click();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);

  await expect(page.getByRole("button", { name: "Создать сессию" })).toBeEnabled();
  await page.getByRole("button", { name: "Создать сессию" }).click();
  await expect(page.locator(".modalTitle")).toContainText("Создание сессии");

  const titleInput = page.locator(".sessionFlowTitleRow .input").first();
  await titleInput.fill(`AI cache ${runId}`);
  const aiBtn = page.locator(".sessionFlowTitleRow .sessionFlowAiBtn");
  await expect(aiBtn).toBeVisible();

  await aiBtn.click();
  await expect(page.locator(".sessionFlowAiItem")).toHaveCount(2);
  await expect(page.locator(".sessionFlowAiItem .sessionFlowAiQuestion").first()).toContainText("готовым результатом");

  await aiBtn.click();
  await expect(page.locator(".badge.err")).toContainText(/cached/i);
  await expect(page.locator(".sessionFlowAiItem")).toHaveCount(2);
  expect(aiCalls).toBeGreaterThanOrEqual(2);
});
