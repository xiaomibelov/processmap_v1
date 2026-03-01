import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

async function apiJson(res, label) {
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  expect(res.ok(), `${label}: status=${res.status()} body=${text}`).toBeTruthy();
  return body;
}

async function createProjectAndSession(request, authHeaders, runId, titleSuffix) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: {
      title: `E2E Pack Project ${runId}`,
      passport: {},
    },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project?.id || project?.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`, {
    headers: authHeaders,
    data: {
      title: `E2E Pack Session ${titleSuffix}`,
      roles: ["Lane 1", "Lane 2"],
      start_role: "Lane 1",
    },
  });
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session?.id || session?.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId };
}

async function createSessionInProject(request, authHeaders, projectId, titleSuffix) {
  const sessionRes = await request.post(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`, {
    headers: authHeaders,
    data: {
      title: `E2E Pack Session ${titleSuffix}`,
      roles: ["Lane 1", "Lane 2"],
      start_role: "Lane 1",
    },
  });
  const session = await apiJson(sessionRes, "create second session");
  const sessionId = String(session?.id || session?.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return sessionId;
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openWorkspaceSession(page, fixture, accessToken, options = {}) {
  if (!options.skipInit) {
    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
      window.localStorage.setItem("fpc_debug_bpmn", "1");
      window.localStorage.setItem("fpc_debug_trace", "1");
      window.localStorage.setItem("fpc_debug_tabs", "1");
      window.localStorage.setItem("fpc_debug_packs", "1");
    });
  }
  if (!options.skipGoto) await page.goto("/app");
  const projectSelect = page.locator(".topbar .topSelect--project");
  const ready = await projectSelect.isVisible({ timeout: 3000 }).catch(() => false);
  if (!ready) {
    await page.evaluate((token) => {
      window.localStorage.setItem("fpc_auth_access_token", String(token || ""));
    }, accessToken);
    await page.reload({ waitUntil: "domcontentloaded" });
  }

  await expect(projectSelect).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

async function assertDiagramReady(page, label) {
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      if (!modeler) return { ok: false, registryCount: -1, svgRect: "0x0" };
      const registry = modeler.get("elementRegistry");
      const count = (registry?.getAll?.() || []).length;
      const svg = modeler.get("canvas")?._container?.querySelector?.("svg");
      const rect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const w = Math.round(Number(rect.width || 0));
      const h = Math.round(Number(rect.height || 0));
      return { ok: count > 0 && w > 0 && h > 0, registryCount: count, svgRect: `${w}x${h}` };
    });
  }, label).toMatchObject({ ok: true });
}

async function createTemplateFragmentFromDiagram(page, marker) {
  const result = await page.evaluate((prefix) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const selection = modeler.get("selection");

      const source = registry.get("Task_1_1")
        || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")))
        || registry.get("StartEvent_1")
        || (registry.getAll() || []).find((el) => /startevent$/i.test(String(el?.type || "")));
      if (!source) return { ok: false, error: "anchor_source_missing" };

      const root = source.parent;
      const first = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(source.x || 0) + 220, y: Number(source.y || 0) + 20 },
        root,
      );
      const second = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(source.x || 0) + 430, y: Number(source.y || 0) + 20 },
        root,
      );
      modeling.updateLabel(first, `${prefix}_A`);
      modeling.updateLabel(second, `${prefix}_B`);
      modeling.connect(first, second, { type: "bpmn:SequenceFlow" });
      selection.select([first, second]);

      return {
        ok: true,
        firstId: String(first.id || ""),
        secondId: String(second.id || ""),
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, marker);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function selectAnchorForInsert(page) {
  const result = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const selection = modeler.get("selection");
      const anchor = registry.get("Task_1_1")
        || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")))
        || registry.get("StartEvent_1")
        || (registry.getAll() || []).find((el) => /startevent$/i.test(String(el?.type || "")));
      if (!anchor) return { ok: false, error: "anchor_not_found" };
      selection.select([anchor]);
      return { ok: true, anchorId: String(anchor.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function readRegistryCount(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler?.get?.("elementRegistry");
    return Array.isArray(registry?.getAll?.()) ? registry.getAll().length : 0;
  });
}

test("template packs: save selected fragment and insert into another session", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const marker = `TPL_${runId.slice(-4)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });

  const first = await createProjectAndSession(request, auth.headers, runId, "A");
  const secondSessionId = await createSessionInProject(request, auth.headers, first.projectId, "B");

  await setUiToken(page, auth.accessToken);
  await openWorkspaceSession(page, first, auth.accessToken);
  await assertDiagramReady(page, "diagram_session_a_ready");

  await createTemplateFragmentFromDiagram(page, marker);

  await page.getByTestId("template-pack-save-open").click();
  await expect(page.getByTestId("template-pack-save-modal")).toBeVisible();
  await page.getByTestId("template-pack-title-input").fill(`Pack ${marker}`);
  await page.getByTestId("template-pack-save-confirm").click();
  await expect(page.getByText(new RegExp(`Шаблон сохранён: Pack ${marker}`))).toBeVisible();

  await page.getByTestId("template-pack-insert-open").click();
  await expect(page.getByTestId("template-pack-modal")).toBeVisible();
  const firstPackCard = page.getByTestId("template-pack-item").first();
  await expect(firstPackCard).toContainText(`Pack ${marker}`);
  await page.getByRole("button", { name: "Закрыть" }).click();

  await page.selectOption(".topbar .topSelect--project", first.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${secondSessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", secondSessionId);
  await switchTab(page, "Diagram");
  await assertDiagramReady(page, "diagram_session_b_ready");

  await selectAnchorForInsert(page);
  const beforeCount = await readRegistryCount(page);

  await page.getByTestId("template-pack-insert-open").click();
  await expect(page.getByTestId("template-pack-modal")).toBeVisible();

  const putResponse = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && /\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())
      && resp.status() === 200;
  });

  await page.getByTestId("template-pack-item").first().getByTestId("template-pack-insert-after").click();
  await putResponse;

  const afterCount = await readRegistryCount(page);
  expect(afterCount).toBeGreaterThan(beforeCount);

  await switchTab(page, "XML");
  const xmlText = await page.locator(".xmlEditorTextarea").inputValue();
  expect(xmlText.length).toBeGreaterThan(1000);
  expect(xmlText).toContain(`${marker}_A`);
  expect(xmlText).toContain(`${marker}_B`);

  // eslint-disable-next-line no-console
  console.log(`[PACK_E2E] registryBefore=${beforeCount} registryAfter=${afterCount} put=200 marker=${marker}`);
});
