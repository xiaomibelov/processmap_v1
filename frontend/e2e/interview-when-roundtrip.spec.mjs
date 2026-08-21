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

async function createFixture(request, runId, accessToken) {
  const authHeaders = withAuthHeaders(accessToken);
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: { title: `E2E interview when ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: authHeaders,
      data: {
        title: `E2E interview when session ${runId}`,
        roles: ["Лайн A", "Лайн B"],
        start_role: "Лайн A",
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
  const expected = String(title || "").trim().toLowerCase();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const active = await page.evaluate(
      () => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase(),
    );
    if (active === expected) return;
    await btn.click();
    const next = await page.evaluate(
      () => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase(),
    );
    if (next === expected) return;
  }
  await expect
    .poll(async () => {
      return await page.evaluate(
        () => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase(),
      );
    })
    .toBe(expected);
}

async function openFixture(page, fixture) {
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
}

async function addQuickSteps(page, names) {
  const actionInputs = page.locator('.interviewStepRow input[placeholder="Глагол + объект"]');
  const quickInput = page.locator(".interviewQuickStepInput");
  await expect(quickInput).toBeVisible();
  for (const name of names) {
    const before = await actionInputs.count();
    await quickInput.fill(name);
    await quickInput.press("Enter");
    await expect(actionInputs).toHaveCount(before + 1);
  }
}

test("Interview transition when round-trips between Interview and XML", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.accessToken);
  const sid = fixture.sessionId;
  const names = [`WHEN_A_${runId.slice(-4)}`, `WHEN_B_${runId.slice(-4)}`, `WHEN_C_${runId.slice(-4)}`];
  const whenA = `WHEN_COND_${runId.slice(-6)}_A`;
  const whenB = `WHEN_COND_${runId.slice(-6)}_B`;

  const patchSignals = [];
  const putSignals = [];
  page.on("response", (res) => {
    const path = responsePath(res.url());
    const method = res.request().method();
    if (method === "PATCH" && path === `/api/sessions/${sid}` && res.status() === 200) patchSignals.push(path);
    if (method === "PUT" && path === `/api/sessions/${sid}/bpmn` && res.status() === 200) putSignals.push(path);
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_trace", "1");
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });
  await setUiToken(page, auth.accessToken);

  await openFixture(page, fixture);
  await switchTab(page, "Interview");
  await expect(page.locator(".interviewStage")).toBeVisible();
  await addQuickSteps(page, names);
  await expect.poll(() => patchSignals.length).toBeGreaterThan(0);

  const transitionsBlock = page.locator(".interviewBlock").filter({
    has: page.locator(".interviewBlockTitle", { hasText: "B2. Ветки BPMN" }),
  }).first();
  await expect(transitionsBlock).toBeVisible();
  const openAddTransitionBtn = transitionsBlock.getByTestId("interview-transition-open-modal");
  await openAddTransitionBtn.click();
  const fromSelect = page.getByTestId("interview-transition-from");
  const toSelect = page.getByTestId("interview-transition-to");
  const whenInput = page.getByTestId("interview-transition-when");
  const addTransitionBtn = page.getByTestId("interview-add-transition-btn");

  const options = await fromSelect.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({
      value: String(node.getAttribute("value") || ""),
      label: String(node.textContent || ""),
    })),
  );
  const fromValue = String(options.find((x) => x.label.includes(names[0]))?.value || "");
  const toValue = String(options.find((x) => x.label.includes(names[1]))?.value || "");
  expect(fromValue).not.toBe("");
  expect(toValue).not.toBe("");

  const patchBeforeLink = patchSignals.length;
  await fromSelect.selectOption(fromValue);
  await toSelect.selectOption(toValue);
  await whenInput.fill(whenA);
  await addTransitionBtn.click();
  await expect.poll(() => patchSignals.length).toBeGreaterThan(patchBeforeLink);

  await switchTab(page, "Diagram");
  const putBeforeSave = putSignals.length;
  await page.locator("button.processSaveBtn").first().click();
  await expect.poll(() => putSignals.length).toBeGreaterThan(putBeforeSave);

  await switchTab(page, "XML");
  const xmlArea = page.locator(".xmlEditorTextarea");
  await expect(xmlArea).toBeVisible();
  const xmlA = await xmlArea.inputValue();
  expect(xmlA).toContain(whenA);
  expect(xmlA).toMatch(/<(?:\w+:)?sequenceFlow\b/);

  const xmlB = xmlA.replace(whenA, whenB);
  await xmlArea.fill(xmlB);
  const putBeforeXmlSave = putSignals.length;
  await page.getByRole("button", { name: "Сохранить XML" }).click();
  await expect.poll(() => putSignals.length).toBeGreaterThan(putBeforeXmlSave);

  await switchTab(page, "Interview");
  await expect.poll(async () => {
    const values = await transitionsBlock.locator(".interviewBranchWhenText")
      .evaluateAll((nodes) => nodes.map((node) => String(node.textContent || "").trim()));
    return values.includes(whenB);
  }).toBeTruthy();
});
