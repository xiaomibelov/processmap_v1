import { expect, test } from "@playwright/test";

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

async function apiLogin(request) {
  const email = process.env.E2E_ADMIN_EMAIL || "admin@local";
  const password = process.env.E2E_ADMIN_PASSWORD || "admin";
  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email, password },
  });
  const body = await apiJson(res, "auth login");
  const token = String(body?.access_token || "").trim();
  expect(token).not.toBe("");
  return token;
}

async function createFixture(request, runId, token) {
  const authHeaders = { Authorization: `Bearer ${token}` };
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: { title: `E2E interview steps create ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: authHeaders,
      data: {
        title: `E2E interview steps create session ${runId}`,
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
    const active = await page.evaluate(() => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase());
    if (active === expected) return;
    await btn.click();
    const next = await page.evaluate(() => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase());
    if (next === expected) return;
  }
  await expect
    .poll(async () => {
      return await page.evaluate(() => String(document.querySelector('.segBtn[aria-selected="true"]')?.textContent || "").trim().toLowerCase());
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

test("Interview add step works via Enter and autosave PATCH", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const token = await apiLogin(request);
  const fixture = await createFixture(request, runId, token);
  const sid = fixture.sessionId;
  const names = Array.from({ length: 5 }, (_, i) => `ENTER_STEP_${i + 1}_${runId.slice(-4)}`);

  const patchSignals = [];
  page.on("response", (res) => {
    const path = responsePath(res.url());
    const method = res.request().method();
    if (method === "PATCH" && path === `/api/sessions/${sid}` && res.status() === 200) patchSignals.push(path);
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_trace", "1");
  });
  await page.addInitScript((accessToken) => {
    window.localStorage.setItem("fpc_auth_access_token", String(accessToken || ""));
  }, token);

  await openFixture(page, fixture);
  await switchTab(page, "Interview");
  await expect(page.locator(".interviewStage")).toBeVisible();

  const actionInputs = page.locator('.interviewStepRow input[placeholder="Глагол + объект"]');
  const baseCount = await actionInputs.count();
  const quickInput = page.locator(".interviewQuickStepInput");
  await expect(quickInput).toBeVisible();

  for (const name of names) {
    const before = await actionInputs.count();
    await quickInput.fill(name);
    await quickInput.press("Enter");
    await expect(actionInputs).toHaveCount(before + 1);
  }

  await expect(actionInputs).toHaveCount(baseCount + names.length);
  await expect.poll(() => patchSignals.length).toBeGreaterThan(0);

  const values = await actionInputs.evaluateAll((nodes) => nodes.map((node) => String(node.value || "")));
  names.forEach((name) => {
    expect(values.includes(name), `missing step '${name}'`).toBeTruthy();
  });
});
