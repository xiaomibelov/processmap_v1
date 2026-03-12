import { test, expect } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function uniqueSuffix() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function apiJson(res, label) {
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  expect(res.ok(), `${label}: ${text}`).toBeTruthy();
  return body;
}

async function authContext(request) {
  const auth = await apiLogin(request);
  const meRes = await request.get(`${API_BASE}/api/auth/me`, {
    headers: auth.headers,
  });
  const me = await apiJson(meRes, "auth me");
  const memberships = Array.isArray(me?.orgs) ? me.orgs : [];
  const activeOrgId = String(me?.active_org_id || auth.activeOrgId || "").trim();
  const activeMembership = memberships.find((row) => String(row?.org_id || "").trim() === activeOrgId) || null;
  return {
    ...auth,
    userId: String(me?.id || "").trim(),
    activeOrgId,
    activeOrgName: String(activeMembership?.name || activeMembership?.org_name || activeOrgId).trim(),
  };
}

async function createDefaultWorkspaceProject(request, auth) {
  const title = `E2E refresh valid ${uniqueSuffix()}`;
  const res = await request.post(`${API_BASE}/api/projects`, {
    headers: auth.headers,
    data: { title, passport: {} },
  });
  const body = await apiJson(res, "create default project");
  return {
    projectId: String(body.id || body.project_id || "").trim(),
    projectTitle: String(body.title || title).trim(),
    workspaceId: String(body.workspace_id || "").trim(),
    orgId: String(auth.activeOrgId || "").trim(),
    orgName: String(auth.activeOrgName || "").trim(),
  };
}

async function createDefaultWorkspaceProjectWithSession(request, auth) {
  const fixture = await createDefaultWorkspaceProject(request, auth);
  const sessionTitle = `E2E back session ${uniqueSuffix()}`;
  const res = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(fixture.projectId)}/sessions?mode=quick_skeleton`,
    {
      headers: auth.headers,
      data: {
        title: sessionTitle,
        roles: ["Оператор"],
        start_role: "Оператор",
      },
    },
  );
  const session = await apiJson(res, "create session for back flow");
  return {
    ...fixture,
    sessionId: String(session.id || session.session_id || "").trim(),
    sessionTitle: String(session.title || session.name || sessionTitle).trim(),
  };
}

async function createNonDefaultWorkspaceProject(request, auth) {
  const workspaceName = `E2E Workspace ${uniqueSuffix()}`;
  const wsRes = await request.post(`${API_BASE}/api/workspaces`, {
    headers: auth.headers,
    data: { name: workspaceName },
  });
  const workspace = await apiJson(wsRes, "create workspace");
  const workspaceId = String(workspace.id || "").trim();
  expect(workspaceId).not.toBe("");

  const folderName = `E2E Folder ${uniqueSuffix()}`;
  const folderRes = await request.post(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/folders`, {
    headers: auth.headers,
    data: { name: folderName, parent_id: "", sort_order: 0 },
  });
  const folder = await apiJson(folderRes, "create folder");
  const folderId = String(folder.id || "").trim();
  expect(folderId).not.toBe("");

  const projectName = `E2E nondefault ${uniqueSuffix()}`;
  const projectRes = await request.post(
    `${API_BASE}/api/folders/${encodeURIComponent(folderId)}/projects?workspace_id=${encodeURIComponent(workspaceId)}`,
    {
      headers: auth.headers,
      data: { name: projectName, description: "" },
    },
  );
  const project = await apiJson(projectRes, "create project in non-default workspace");
  return {
    workspaceId,
    workspaceName,
    projectId: String(project.id || project.project_id || "").trim(),
    projectTitle: String(project.name || project.title || projectName).trim(),
    orgId: String(auth.activeOrgId || "").trim(),
    orgName: String(auth.activeOrgName || "").trim(),
  };
}

async function installNotFoundObserver(page) {
  await page.addInitScript(() => {
    window.__E2E_PROJECT_NOT_FOUND_EVENTS__ = [];
    const state = { visible: false };
    const record = () => {
      const text = String(document.body?.innerText || "").toLowerCase();
      const visible = text.includes("project not found");
      if (visible && !state.visible) {
        window.__E2E_PROJECT_NOT_FOUND_EVENTS__.push({
          ts: Date.now(),
          href: String(window.location.href || ""),
          text,
        });
      }
      state.visible = visible;
    };
    const start = () => {
      record();
      const observer = new MutationObserver(record);
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      window.addEventListener("beforeunload", () => observer.disconnect(), { once: true });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  });
}

async function resetUiStorage(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // ignore storage errors in tests
    }
  });
}

async function getNotFoundEvents(page) {
  return page.evaluate(() => Array.isArray(window.__E2E_PROJECT_NOT_FOUND_EVENTS__) ? window.__E2E_PROJECT_NOT_FOUND_EVENTS__ : []);
}

async function setChosenOrgContext(page, auth) {
  await page.addInitScript(({ userId, orgId }) => {
    const uid = String(userId || "").trim();
    const oid = String(orgId || "").trim();
    if (!uid || !oid) return;
    window.localStorage.setItem("fpc_active_org_id", oid);
    window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
  }, {
    userId: String(auth?.userId || "").trim(),
    orgId: String(auth?.activeOrgId || "").trim(),
  });
}

async function waitForProjectPane(page, fixture) {
  const heading = page.getByRole("heading", { name: fixture.projectTitle });
  await expect(heading).toBeVisible();
  await expect(page.getByText(/project not found/i)).toHaveCount(0);
}

function collectProjectExplorerTraffic(page, projectId) {
  const requests = [];
  const responses = [];
  const marker = `/api/projects/${encodeURIComponent(String(projectId || "").trim())}/explorer`;

  page.on("request", (req) => {
    const url = String(req.url() || "");
    if (!url.includes(marker)) return;
    const parsed = new URL(url);
    requests.push({
      url,
      workspaceId: String(parsed.searchParams.get("workspace_id") || "").trim(),
      method: req.method(),
    });
  });

  page.on("response", async (res) => {
    const url = String(res.url() || "");
    if (!url.includes(marker)) return;
    const parsed = new URL(url);
    responses.push({
      url,
      workspaceId: String(parsed.searchParams.get("workspace_id") || "").trim(),
      status: res.status(),
    });
  });

  return { requests, responses };
}

function collectBootstrapTraffic(page) {
  const entries = [];
  page.on("request", (req) => {
    const url = String(req.url() || "");
    if (!url.includes("/api/")) return;
    entries.push({
      kind: "request",
      method: req.method(),
      url,
      ts: Date.now(),
    });
  });
  page.on("response", (res) => {
    const url = String(res.url() || "");
    if (!url.includes("/api/")) return;
    entries.push({
      kind: "response",
      status: res.status(),
      url,
      ts: Date.now(),
    });
  });
  return entries;
}

function collectWorkspaceExplorerTraffic(page) {
  const requests = [];
  const responses = [];
  const marker = "/api/explorer?";

  page.on("request", (req) => {
    const url = String(req.url() || "");
    if (!url.includes(marker)) return;
    const parsed = new URL(url);
    requests.push({
      url,
      workspaceId: String(parsed.searchParams.get("workspace_id") || "").trim(),
      folderId: String(parsed.searchParams.get("folder_id") || "").trim(),
      method: req.method(),
    });
  });

  page.on("response", async (res) => {
    const url = String(res.url() || "");
    if (!url.includes(marker)) return;
    const parsed = new URL(url);
    responses.push({
      url,
      workspaceId: String(parsed.searchParams.get("workspace_id") || "").trim(),
      folderId: String(parsed.searchParams.get("folder_id") || "").trim(),
      status: res.status(),
    });
  });

  return { requests, responses };
}

async function activeWorkspaceLabel(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("div"))
      .filter((el) => {
        const cls = String(el.className || "");
        return cls.includes("bg-accentSoft") && cls.includes("font-medium");
      });
    const row = rows.find((el) => el.querySelector("button"));
    return String(row?.innerText || "").trim();
  });
}

test.describe("project deep-link refresh restore", () => {
  test("app home without explicit project does not auto-select the first project", async ({ page, request }) => {
    const auth = await authContext(request);
    const fixture = await createDefaultWorkspaceProject(request, auth);

    await resetUiStorage(page);
    await installNotFoundObserver(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await setChosenOrgContext(page, auth);

    await page.goto("/app", { waitUntil: "domcontentloaded" });

    await expect
      .poll(() => {
        const url = new URL(page.url());
        return String(url.searchParams.get("project") || "").trim();
      })
      .toBe("");

    await page.waitForTimeout(500);
    await expect(page.getByRole("heading", { name: fixture.projectTitle })).toHaveCount(0);
    await expect(page.getByText(/project not found/i)).toHaveCount(0);
  });

  test("valid project deep-link survives reload without false not-found", async ({ page, request }) => {
    const auth = await authContext(request);
    const fixture = await createDefaultWorkspaceProject(request, auth);
    const traffic = collectProjectExplorerTraffic(page, fixture.projectId);
    const bootstrapTraffic = collectBootstrapTraffic(page);

    await resetUiStorage(page);
    await installNotFoundObserver(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await setChosenOrgContext(page, auth);

    await page.goto(`/app?project=${fixture.projectId}`, { waitUntil: "domcontentloaded" });
    await waitForProjectPane(page, fixture);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForProjectPane(page, fixture);

    const notFoundEvents = await getNotFoundEvents(page);
    expect(notFoundEvents, JSON.stringify(notFoundEvents)).toEqual([]);

    expect(traffic.responses.length).toBeGreaterThan(0);
    expect(traffic.responses.every((item) => item.status === 200), JSON.stringify(traffic.responses)).toBeTruthy();
    const seenWorkspaceIds = [...new Set(traffic.responses.map((item) => item.workspaceId).filter(Boolean))];
    expect(seenWorkspaceIds.length, JSON.stringify(traffic.responses)).toBe(1);
    expect(
      bootstrapTraffic.some((entry) => entry.url.includes("/api/workspaces")),
      JSON.stringify(bootstrapTraffic, null, 2),
    ).toBeTruthy();
  });

  test("valid project in non-default workspace resolves the correct workspace before project lookup", async ({ page, request }) => {
    const auth = await authContext(request);
    const fixture = await createNonDefaultWorkspaceProject(request, auth);
    const traffic = collectProjectExplorerTraffic(page, fixture.projectId);

    await resetUiStorage(page);
    await installNotFoundObserver(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await setChosenOrgContext(page, auth);

    await page.goto(`/app?project=${fixture.projectId}`, { waitUntil: "domcontentloaded" });
    await waitForProjectPane(page, fixture);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForProjectPane(page, fixture);

    const notFoundEvents = await getNotFoundEvents(page);
    expect(notFoundEvents, JSON.stringify(notFoundEvents)).toEqual([]);

    expect(traffic.responses.length).toBeGreaterThan(0);
    expect(traffic.responses.every((item) => item.status === 200), JSON.stringify(traffic.responses)).toBeTruthy();
    expect(traffic.responses.every((item) => item.workspaceId === fixture.workspaceId), JSON.stringify(traffic.responses)).toBeTruthy();

    const activeWorkspace = await activeWorkspaceLabel(page);
    expect(activeWorkspace).toContain(fixture.workspaceName);
  });

  test("user can leave deep-linked project pane back to explorer without auto-reopen loop", async ({ page, request }) => {
    const auth = await authContext(request);
    const fixture = await createDefaultWorkspaceProject(request, auth);
    const traffic = collectProjectExplorerTraffic(page, fixture.projectId);

    await resetUiStorage(page);
    await installNotFoundObserver(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await setChosenOrgContext(page, auth);

    await page.goto(`/app?project=${fixture.projectId}`, { waitUntil: "domcontentloaded" });
    await waitForProjectPane(page, fixture);

    const responsesBeforeBack = traffic.responses.length;
    await page.getByTestId("topbar-back-projects").click();

    await expect
      .poll(() => {
        const url = new URL(page.url());
        return String(url.searchParams.get("project") || "").trim();
      })
      .toBe("");

    await expect(page.getByRole("heading", { name: fixture.projectTitle })).toHaveCount(0);
    await expect(page.getByText("Выберите workspace слева")).toHaveCount(0);
    await expect(page.getByText(/project not found/i)).toHaveCount(0);
    await expect(page.locator("table")).toBeVisible();

    await page.waitForTimeout(1200);
    await expect(page.getByRole("heading", { name: fixture.projectTitle })).toHaveCount(0);
    expect(traffic.responses.length, JSON.stringify(traffic.responses)).toBe(responsesBeforeBack);
  });

  test("manual project click from explorer opens project pane when no explicit project is selected", async ({ page, request }) => {
    const auth = await authContext(request);
    const fixture = await createDefaultWorkspaceProject(request, auth);

    await resetUiStorage(page);
    await installNotFoundObserver(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await setChosenOrgContext(page, auth);

    await page.goto("/app", { waitUntil: "domcontentloaded" });

    await expect
      .poll(() => {
        const url = new URL(page.url());
        return String(url.searchParams.get("project") || "").trim();
      })
      .toBe("");

    await page.getByText(fixture.projectTitle, { exact: true }).click();

    await expect(page.getByRole("heading", { name: fixture.projectTitle })).toBeVisible();
    await expect(page.getByText(/project not found/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: fixture.projectTitle, exact: true })).toHaveCount(0);
  });

  test("returning from session to project does not scan unrelated workspaces", async ({ page, request }) => {
    const auth = await authContext(request);
    const fixture = await createDefaultWorkspaceProjectWithSession(request, auth);
    const explorerTraffic = collectWorkspaceExplorerTraffic(page);

    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
    });
    await resetUiStorage(page);
    await installNotFoundObserver(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await setChosenOrgContext(page, auth);

    await page.goto(`/app?project=${fixture.projectId}`, { waitUntil: "domcontentloaded" });
    await waitForProjectPane(page, fixture);

    await page.evaluate(async (sid) => {
      const opener = window?.__FPC_E2E_OPEN_SESSION__;
      if (typeof opener !== "function") {
        throw new Error("missing_open_session_helper");
      }
      const result = await opener(sid);
      if (!result?.ok) {
        throw new Error(String(result?.error || "open_session_failed"));
      }
    }, fixture.sessionId);

    await expect(page.getByTestId("topbar-back-projects")).toHaveText(/к проекту/i);
    const responsesBeforeBack = explorerTraffic.responses.length;
    await page.getByTestId("topbar-back-projects").click();

    await expect
      .poll(() => {
        const url = new URL(page.url());
        return {
          project: String(url.searchParams.get("project") || "").trim(),
          session: String(url.searchParams.get("session") || "").trim(),
        };
      })
      .toEqual({ project: fixture.projectId, session: "" });

    await expect(page.getByRole("heading", { name: fixture.projectTitle })).toBeVisible();
    await page.waitForTimeout(1200);

    const responsesAfterBack = explorerTraffic.responses.slice(responsesBeforeBack);
    const expectedWorkspaceId = String(fixture.workspaceId || responsesAfterBack[0]?.workspaceId || "").trim();
    expect(responsesAfterBack.length).toBeGreaterThan(0);
    expect(
      responsesAfterBack.every((item) => item.status === 200),
      JSON.stringify(responsesAfterBack),
    ).toBeTruthy();
    expect(
      responsesAfterBack.every((item) => item.workspaceId === expectedWorkspaceId),
      JSON.stringify(responsesAfterBack),
    ).toBeTruthy();
  });

  test("switching workspace after returning from session clears stale project query", async ({ page, request }) => {
    const auth = await authContext(request);
    const fixture = await createDefaultWorkspaceProjectWithSession(request, auth);
    const otherWorkspace = await createNonDefaultWorkspaceProject(request, auth);
    const explorerTraffic = collectWorkspaceExplorerTraffic(page);

    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
    });
    await resetUiStorage(page);
    await installNotFoundObserver(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await setChosenOrgContext(page, auth);

    await page.goto(`/app?project=${fixture.projectId}`, { waitUntil: "domcontentloaded" });
    await waitForProjectPane(page, fixture);

    await page.evaluate(async (sid) => {
      const opener = window?.__FPC_E2E_OPEN_SESSION__;
      if (typeof opener !== "function") {
        throw new Error("missing_open_session_helper");
      }
      const result = await opener(sid);
      if (!result?.ok) {
        throw new Error(String(result?.error || "open_session_failed"));
      }
    }, fixture.sessionId);

    await expect(page.getByTestId("topbar-back-projects")).toHaveText(/к проекту/i);
    await page.getByTestId("topbar-back-projects").click();
    await waitForProjectPane(page, fixture);

    const responsesBeforeSwitch = explorerTraffic.responses.length;
    await page.getByText(otherWorkspace.workspaceName, { exact: true }).click();

    await expect
      .poll(() => {
        const url = new URL(page.url());
        return {
          project: String(url.searchParams.get("project") || "").trim(),
          session: String(url.searchParams.get("session") || "").trim(),
        };
      })
      .toEqual({ project: "", session: "" });

    await expect(page.getByRole("heading", { name: fixture.projectTitle })).toHaveCount(0);
    await expect(page.getByText(otherWorkspace.workspaceName, { exact: true })).toBeVisible();
    await page.waitForTimeout(1200);

    const responsesAfterSwitch = explorerTraffic.responses.slice(responsesBeforeSwitch);
    expect(responsesAfterSwitch.length).toBeGreaterThan(0);
    expect(
      responsesAfterSwitch.every((item) => item.status === 200),
      JSON.stringify(responsesAfterSwitch),
    ).toBeTruthy();
    expect(
      responsesAfterSwitch.every((item) => item.workspaceId === otherWorkspace.workspaceId),
      JSON.stringify(responsesAfterSwitch),
    ).toBeTruthy();
  });

  test("invalid stale project id stays in loading/restoring state until lookup finishes, then shows final not-found", async ({ page, request }) => {
    const auth = await authContext(request);
    const invalidProjectId = `stale_${uniqueSuffix()}`;
    const traffic = collectProjectExplorerTraffic(page, invalidProjectId);

    await resetUiStorage(page);
    await installNotFoundObserver(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await setChosenOrgContext(page, auth);

    await page.route(`**/api/projects/${invalidProjectId}/explorer?**`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto(`/app?project=${invalidProjectId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Восстанавливаем проект…")).toBeVisible();
    await page.waitForTimeout(150);
    await expect(page.getByText(/project not found/i)).toHaveCount(0);

    await expect(page.getByText(/project not found/i)).toBeVisible({ timeout: 60000 });

    const notFoundEvents = await getNotFoundEvents(page);
    expect(notFoundEvents.length).toBeGreaterThan(0);
    await expect
      .poll(() => traffic.responses.some((item) => item.status === 404), {
        timeout: 60000,
      })
      .toBeTruthy();
  });
});
