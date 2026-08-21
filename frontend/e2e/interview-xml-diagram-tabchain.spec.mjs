import { test, expect } from "@playwright/test";

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

async function switchTab(page, title) {
  const rx = new RegExp(`^${title}`);
  const btn = page.locator(".segBtn").filter({ hasText: rx }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function createSessionFixture(request, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E chain project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E chain session ${runId}`,
        roles: ["Повар 1", "Повар 2", "Бригадир"],
        start_role: "Повар 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId };
}

async function openSession(page, { projectId, sessionId }) {
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", sessionId);
}

async function expectStepInInterview(page, stepTextLower) {
  await switchTab(page, "Interview");
  await expect
    .poll(async () => {
      return await page
        .locator(".interviewStepRow td .input")
        .evaluateAll((els, expected) => els.some((el) => String(el.value || "").toLowerCase().includes(expected)), stepTextLower);
    })
    .toBeTruthy();
}

async function expectStepInXml(page, stepTextLower) {
  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  await expect
    .poll(async () => (await xmlArea.inputValue()).toLowerCase())
    .toContain(stepTextLower);
}

async function expectStepInDiagram(page, stepTextLower) {
  await switchTab(page, "Diagram");
  await expect
    .poll(async () => {
      return await page.evaluate((needle) => {
        const modeler = window.__FPC_E2E_MODELER__;
        if (!modeler) return false;
        const registry = modeler.get("elementRegistry");
        if (!registry) return false;
        const all = registry.getAll() || [];
        return all.some((el) => {
          const name = String(el?.businessObject?.name || "").toLowerCase();
          return name.includes(needle);
        });
      }, stepTextLower);
    })
    .toBeTruthy();
}

test("Interview -> XML -> Diagram -> back keeps step persisted on every transition", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stepText = `E2E цепочка ${runId}`;
  const stepTextLower = stepText.toLowerCase();
  const fixture = await createSessionFixture(request, runId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await openSession(page, fixture);

  await switchTab(page, "Interview");
  const quickInput = page.getByPlaceholder("Быстрый ввод шага: введите действие и нажмите Enter");
  await expect(quickInput).toBeVisible();
  await quickInput.fill(stepText);
  await quickInput.press("Enter");

  await expectStepInInterview(page, stepTextLower);
  await expectStepInXml(page, stepTextLower);
  await expectStepInDiagram(page, stepTextLower);

  await expectStepInInterview(page, stepTextLower);
  await expectStepInDiagram(page, stepTextLower);
  await expectStepInXml(page, stepTextLower);
});
