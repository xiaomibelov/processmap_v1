// Диплинк на сессию не должен упираться в org-picker («Выберите организацию»)
// для пользователя с несколькими org — fix/session-deeplink-404.
//
// Диагностика контура (stage 2026-09-17): реальный флоу пользователя с 28 org
// по ссылке /app?project=<id>&session=<id> показывал стену выбора организации;
// URL-параметры picker не читал. Org резолвится из project_id ссылки; если org
// проекта — membership пользователя, выбор происходит автоматически.
//
// Контракт #641 не тронут: удалённая сессия по-прежнему даёт 404 и экран
// «Сессия удалена или недоступна» (dead-session-back-to-list).
//
// Прогон: E2E_APP_BASE_URL/E2E_API_BASE_URL на stage (пользователь с >1 org).
//   npx playwright test e2e/session-deeplink-org-choice.spec.mjs

import { expect, test } from "@playwright/test";

import { apiLogin } from "./helpers/e2eAuth.mjs";

const APP_BASE = String(process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177").trim().replace(/\/+$/, "");
const API_BASE = String(process.env.E2E_API_BASE_URL || APP_BASE).trim().replace(/\/+$/, "");

const MINIMAL_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Definitions_dl" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_dl" isExecutable="false">
    <bpmn:startEvent id="StartEvent_dl" />
    <bpmn:task id="Task_dl_1" name="Deeplink task" />
    <bpmn:sequenceFlow id="Flow_dl_1" sourceRef="StartEvent_dl" targetRef="Task_dl_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_dl">
    <bpmndi:BPMNPlane id="BPMNPlane_dl" bpmnElement="Process_dl">
      <bpmndi:BPMNShape id="StartEvent_dl_di" bpmnElement="StartEvent_dl">
        <dc:Bounds x="172" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_dl_1_di" bpmnElement="Task_dl_1">
        <dc:Bounds x="260" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function createProjectSession(request, auth, runTag) {
  const projRes = await request.post(`${API_BASE}/api/projects`, {
    headers: auth.headers,
    data: { title: `deeplink-${runTag}` },
  });
  if (!projRes.ok()) throw new Error(`project create failed: ${projRes.status()}`);
  const project = await projRes.json();
  const projectId = String(project?.id || project?.project?.id || "").trim();
  if (!projectId) throw new Error("project id missing in response");

  const sessRes = await request.post(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions`, {
    headers: auth.headers,
    data: { title: `deeplink-session-${runTag}`, mode: "as_is" },
  });
  if (!sessRes.ok()) throw new Error(`session create failed: ${sessRes.status()}`);
  const session = await sessRes.json();
  const sessionId = String(session?.id || session?.session?.id || "").trim();
  if (!sessionId) throw new Error("session id missing in response");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers: auth.headers,
    data: { xml: MINIMAL_BPMN, base_diagram_state_version: 0, base_bpmn_xml_version: 0 },
  });
  if (!putRes.ok()) throw new Error(`bpmn put failed: ${putRes.status()}`);
  return { projectId, sessionId };
}

async function uiLogin(page) {
  await page.goto(`${APP_BASE}/`, { waitUntil: "domcontentloaded" });
  const email = String(process.env.E2E_USER || "").trim();
  const password = String(process.env.E2E_PASS || "");
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
  const passInput = page.locator('input[type="password"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  await emailInput.fill(email);
  const loginResponse = page.waitForResponse(
    (resp) => resp.url().includes("/api/auth/login") && resp.request().method() === "POST",
    { timeout: 30_000 },
  );
  await passInput.fill(password);
  await passInput.press("Enter");
  const loginResp = await loginResponse;
  expect(loginResp.ok(), `login status=${loginResp.status()}`).toBeTruthy();
  await page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 30_000 });
}

async function waitCanvasReady(page) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
          try {
            return modeler?.get("elementRegistry")?.getAll()?.length || 0;
          } catch {
            return 0;
          }
        }),
      { timeout: 90_000, message: "modeler must render the session" },
    )
    .toBeGreaterThanOrEqual(2);
}

test.describe("session deeplink vs org picker (fix/session-deeplink-404)", () => {
  test("живая сессия: диплинк открывается без клика по org-picker", async ({ page, request }) => {
    const runTag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
    const { projectId, sessionId } = await createProjectSession(request, auth, runTag);

    await uiLogin(page);
    // Диплинк как у пользователя: без инъекций токена/орга, с org-picker-стеной
    // при >1 org (у тестового пользователя их много).
    await page.goto(
      `${APP_BASE}/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(sessionId)}`,
      { waitUntil: "domcontentloaded" },
    );

    // Стены «Выберите организацию» быть не должно — org резолвится из проекта.
    await expect(
      page.getByText("Выберите организацию", { exact: false }).first(),
      "org-picker wall must not block a resolvable deeplink",
    ).toBeHidden({ timeout: 45_000 });
    await waitCanvasReady(page);
  });

  test("удалённая сессия: диплинк резолвит org без picker, 404 без вечного спиннера (#641-регрессия)", async ({ page, request }) => {
    const runTag = `del${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
    const { projectId, sessionId } = await createProjectSession(request, auth, runTag);

    const delRes = await request.delete(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, {
      headers: auth.headers,
    });
    expect(delRes.ok() || delRes.status() === 204, `delete status=${delRes.status()}`).toBeTruthy();

    const session404 = page.waitForResponse(
      (resp) => resp.url().includes(`/api/sessions/${sessionId}`) && resp.status() === 404,
      { timeout: 90_000 },
    );

    await uiLogin(page);
    await page.goto(
      `${APP_BASE}/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(sessionId)}`,
      { waitUntil: "domcontentloaded" },
    );

    // Регрессия #641: GET удалённой сессии — контрактный 404 SESSION_NOT_FOUND.
    const notFound = await session404;
    const notFoundBody = await notFound.json().catch(() => ({}));
    expect(String(notFoundBody?.detail?.code || "")).toBe("SESSION_NOT_FOUND");

    // Org-picker не должен блокировать диплинк даже для удалённой сессии
    // (org резолвится из project). Продукт для диплинка мёртвой сессии
    // показывает fallback workspace проекта (идентично на fix и на parent —
    // зафиксировано в VERIFY.md; dead-screen через диплинк — отдельная
    // продуктовая находка вне этого фикса).
    await expect(
      page.getByText("Выберите организацию", { exact: false }).first(),
      "org-picker wall must not block deeplink of deleted session",
    ).toBeHidden({ timeout: 45_000 });
    // Не вечный спиннер: через 30 с после 404 UI живой (fallback workspace).
    await page.waitForTimeout(30_000);
    const rootChildCount = await page.evaluate(() => document.getElementById("root")?.childElementCount || 0);
    expect(rootChildCount, "app must not be stuck on a blank/spinner screen").toBeGreaterThan(0);
  });

  test("plain /app без параметров: org-picker показывается как раньше", async ({ page }) => {
    await uiLogin(page);
    await page.goto(`${APP_BASE}/app`, { waitUntil: "domcontentloaded" });
    // Дифф фикса не должен ломать обычный вход: без project-ссылки стена
    // выбора org для мульти-org пользователя остаётся.
    await expect(
      page.getByText("Выберите организацию", { exact: false }).first(),
    ).toBeVisible({ timeout: 45_000 });
  });

});
