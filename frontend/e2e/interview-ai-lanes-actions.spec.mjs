import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken, withAuthHeaders } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function responsePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

async function apiJson(res, label) {
  const txt = await res.text();
  let body = {};
  try {
    body = txt ? JSON.parse(txt) : {};
  } catch {
    body = { raw: txt };
  }
  expect(res.ok(), `${label}: ${txt}`).toBeTruthy();
  return body;
}

async function createFixture(request, runId, token) {
  const headers = withAuthHeaders(token);
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { title: `E2E interview ux ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E interview ux session ${runId}`,
        roles: ["L1 Цех", "L2 Цех", "L3 Цех"],
        start_role: "L1 Цех",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
  await expect
    .poll(async () => {
      return await page.evaluate(() => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase());
    })
    .toBe(String(title || "").trim().toLowerCase());
}

async function openFixture(page, fixture) {
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await expect
    .poll(async () => await page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`).count())
    .toBe(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
}

async function assertLaneChipsUnique(page) {
  const chips = page.getByTestId("interview-lane-chip");
  await expect(chips.first()).toBeVisible();
  const labels = await chips.allInnerTexts();
  const normalized = labels
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .filter((x) => x !== "Все лайны");
  const unique = new Set(normalized.map((x) => x.toLowerCase()));
  expect(normalized.length, `duplicate lane chips: ${JSON.stringify(normalized)}`).toBe(unique.size);
}

test("Interview: lanes dedupe + AI badge persistence + AI filter + sort switch", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { accessToken } = await apiLogin(request);
  const fixture = await createFixture(request, runId, accessToken);

  await setUiToken(page, accessToken);
  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_debug_trace", "1");
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });

  const patchSignals = [];
  page.on("response", (res) => {
    const path = responsePath(res.url());
    if (res.request().method() === "PATCH" && path === `/api/sessions/${fixture.sessionId}` && res.status() === 200) {
      patchSignals.push(path);
    }
  });

  await page.route(/\/api\/sessions\/[^/]+\/ai\/questions$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llm_step: {
          status: "processed",
          generated: 1,
          total: 1,
        },
        questions: [
          {
            id: `q_${runId}`,
            question: `Контрольный вопрос ${runId.slice(-4)}`,
            status: "open",
          },
        ],
      }),
    });
  });

  await openFixture(page, fixture);
  await switchTab(page, "Interview");
  await expect(page.locator(".interviewStage")).toBeVisible();
  await assertLaneChipsUnique(page);

  const firstRow = page.locator(".interviewStepRow").first();
  await expect(firstRow).toBeVisible();
  await firstRow.locator(".interviewRowActions .secondaryBtn").filter({ hasText: /^AI$/i }).click();
  await expect(page.locator(".interviewAiCueList")).toBeVisible();
  await expect
    .poll(async () => {
      const badgeText = await firstRow.getByTestId("interview-step-ai-badge").innerText();
      const m = String(badgeText || "").match(/AI:\s*(\d+)/i);
      return Number(m?.[1] || 0);
    })
    .toBeGreaterThan(0);
  await expect.poll(() => patchSignals.length).toBeGreaterThan(0);

  await page.reload();
  await openFixture(page, fixture);
  await switchTab(page, "Interview");
  await expect
    .poll(async () => {
      const texts = await page.getByTestId("interview-step-ai-badge").allInnerTexts();
      return texts.some((txt) => Number(String(txt || "").match(/AI:\s*(\d+)/i)?.[1] || 0) > 0);
    })
    .toBeTruthy();

  await switchTab(page, "Diagram");
  await switchTab(page, "Interview");
  await expect
    .poll(async () => {
      const texts = await page.getByTestId("interview-step-ai-badge").allInnerTexts();
      return texts.some((txt) => Number(String(txt || "").match(/AI:\s*(\d+)/i)?.[1] || 0) > 0);
    })
    .toBeTruthy();

  await page.getByTestId("interview-filter-ai-with").click();
  await expect
    .poll(async () => await page.locator(".interviewStepRow").count())
    .toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const texts = await page.getByTestId("interview-step-ai-badge").allInnerTexts();
      return texts.every((txt) => Number(String(txt || "").match(/AI:\s*(\d+)/i)?.[1] || 0) > 0);
    })
    .toBeTruthy();

  await page.getByTestId("interview-order-interview-btn").click();
  await page.getByTestId("interview-order-bpmn-btn").click();
  await assertLaneChipsUnique(page);
  await expect
    .poll(async () => {
      const texts = await page.getByTestId("interview-step-ai-badge").allInnerTexts();
      return texts.some((txt) => Number(String(txt || "").match(/AI:\s*(\d+)/i)?.[1] || 0) > 0);
    })
    .toBeTruthy();
});

test("Interview: selection actions visible + delete via menu confirm", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { accessToken } = await apiLogin(request);
  const fixture = await createFixture(request, runId, accessToken);
  const stepName = `DELETE_ME_${runId.slice(-4)}`;

  await setUiToken(page, accessToken);
  const patchSignals = [];
  page.on("response", (res) => {
    const path = responsePath(res.url());
    if (res.request().method() === "PATCH" && path === `/api/sessions/${fixture.sessionId}` && res.status() === 200) {
      patchSignals.push(path);
    }
  });

  await openFixture(page, fixture);
  await switchTab(page, "Interview");
  await expect(page.locator(".interviewStage")).toBeVisible();

  const quickInput = page.locator(".interviewQuickStepInput");
  await quickInput.fill(stepName);
  await quickInput.press("Enter");
  await expect(page.locator('.interviewStepRow input[placeholder="Глагол + объект"]')).toContainText(stepName);

  const actionInputs = page.locator('.interviewStepRow input[placeholder="Глагол + объект"]');
  const valuesBeforeDelete = await actionInputs.evaluateAll((nodes) => nodes.map((node) => String(node.value || "")));
  const deleteRowIndex = valuesBeforeDelete.findIndex((value) => String(value || "") === stepName);
  expect(deleteRowIndex, `missing step '${stepName}'`).toBeGreaterThanOrEqual(0);
  const row = page.locator(".interviewStepRow").nth(deleteRowIndex);
  await row.getByTestId("interview-step-select").check();

  const selectionBar = page.getByTestId("interview-selection-actions");
  await expect(selectionBar).toBeVisible();
  await expect(selectionBar.getByTestId("interview-selected-ai-status")).toBeVisible();
  await expect(selectionBar.getByTestId("interview-selected-open-ai")).toBeVisible();
  await expect(selectionBar.getByTestId("interview-selected-generate-ai")).toBeVisible();
  await expect(selectionBar.getByTestId("interview-selected-open-binding")).toBeVisible();
  await expect(selectionBar.getByTestId("interview-selected-delete")).toBeVisible();

  await row.getByTestId("interview-step-more-actions").click();
  await expect(row.getByTestId("interview-step-actions-menu")).toBeVisible();
  await expect(row.getByTestId("interview-step-delete-action")).toBeVisible();

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  const patchBeforeDelete = patchSignals.length;
  await row.getByTestId("interview-step-delete-action").click();
  await expect.poll(() => patchSignals.length).toBeGreaterThan(patchBeforeDelete);
  await expect
    .poll(async () => {
      const values = await actionInputs.evaluateAll((nodes) => nodes.map((node) => String(node.value || "")));
      return values.includes(stepName);
    })
    .toBeFalsy();
});
