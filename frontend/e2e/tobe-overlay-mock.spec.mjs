// E2E-спека feature/tobe-overlay-mock-v1 (T7) — UX-контракт mock-режима
// TO BE overlay:
//   1. Флаг on → кнопка входа видна в хидере (ProcessStageHeader).
//   2. Вход → .bpmnLayer--mockTobe содержит SVG с элементами фикстуры;
//      .bpmnLayer--mockAsis виден и инертен (pointer-events: none).
//   3. Hide → ghost скрыт; TO BE-слой остался.
//   4. Выход → слоёв мока нет; сессионный слой вернулся.
//   5. Флаг off → кнопки нет.
// Требует живого стека (E2E_API_BASE_URL / E2E_APP_BASE_URL).

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, openFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

const RUN_ID = `tobe_overlay_mock_${Date.now()}`;

async function setTobeOverlayMockFlag(request, auth, value) {
  const res = await request.patch(`${API_BASE}/api/admin/feature-flags`, {
    headers: auth.headers,
    data: { flags: { tobe_overlay_mock: value } },
  });
  expect(res.ok(), `set tobe_overlay_mock=${value}: ${res.status()}`).toBeTruthy();
}

test.describe("tobe-overlay-mock (T7)", () => {
  test("вход/выход из mock-режима, ghost show/hide, gate флага", async ({ page, request }) => {
    const auth = await apiLogin(request, { apiBase: API_BASE });
    await setTobeOverlayMockFlag(request, auth, true);

    // Network assert (review): в mock-режиме — НОЛЬ сетевых обращений
    // к сессии (любых: чтений bpmn, мутаций, presence). За весь тест —
    // ноль МУТАЦИЙ диаграммы (PUT/PATCH/DELETE /api/sessions/{id}).
    // Известный не-мутационный шум приложения фиксируется отдельно:
    //   - GET /api/sessions/{id}/bpmn* — загрузка диаграммы (load/reload);
    //   - DELETE /api/sessions/{id}/presence — collab-lifecycle при unload.
    const diagramMutations = [];
    const bpmnReads = [];
    const presenceDeletes = [];
    const sessionRequestsWhileMockActive = [];
    let mockActive = false;
    page.on("request", (req) => {
      const url = req.url();
      if (!url.includes("/api/sessions/")) return;
      const isSessionBpmn = /\/api\/sessions\/[^/?#]+\/bpmn/.test(url);
      const isPresence = /\/api\/sessions\/[^/?#]+\/presence$/.test(url);
      const isMutatingMethod = ["PUT", "PATCH", "DELETE"].includes(req.method());
      if (mockActive) sessionRequestsWhileMockActive.push({ method: req.method(), url });
      if (isSessionBpmn && !isMutatingMethod) {
        bpmnReads.push({ method: req.method(), url });
      } else if (isPresence && req.method() === "DELETE") {
        presenceDeletes.push({ method: req.method(), url });
      } else if (isMutatingMethod) {
        diagramMutations.push({ method: req.method(), url });
      }
    });

    const fixture = await createFixture(request, RUN_ID, auth.headers);
    await setUiToken(page, auth.accessToken);
    const orgId = String(fixture.orgId || auth.activeOrgId || "").trim();
    await page.addInitScript((value) => {
      if (value) window.localStorage.setItem("fpc_active_org_id", value);
    }, orgId);
    await openFixture(page, fixture);
    const chooser = page.getByText("Выберите организацию").first();
    for (let i = 0; i < 40; i += 1) {
      if (await chooser.isVisible().catch(() => false)) {
        await page.getByRole("button", { name: /Default/i }).first().click();
        break;
      }
      if (await page.locator(".bpmnStageHost").isVisible().catch(() => false)) break;
      await page.waitForTimeout(500);
    }
    await waitForDiagramReady(page);

    const tobeLayer = page.locator(".bpmnLayer--mockTobe");
    const asisLayer = page.locator(".bpmnLayer--mockAsis");

    // 1. Флаг on → кнопка входа видна в хидере.
    const enterBtn = page.getByTestId("tobe-overlay-mock-enter");
    await expect(enterBtn).toBeVisible();

    // 2. Вход → mock-слои видны, ghost инертен, фикстуры отрендерены,
    //    сессионные слои скрыты (modeler/viewer не тронуты).
    await enterBtn.click();
    mockActive = true;
    await expect(tobeLayer).toBeVisible();
    await expect(asisLayer).toBeVisible();
    await expect(tobeLayer.locator('[data-element-id="MockToBe_TaskApprove"]')).toBeVisible();
    await expect(asisLayer.locator('[data-element-id="MockAsIs_TaskReview"]')).toBeVisible();
    expect(await asisLayer.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    await expect(page.locator(".bpmnLayer--editor")).toBeHidden();
    await expect(page.locator(".bpmnLayer--diagram")).toBeHidden();

    // 3. Hide → ghost скрыт; TO BE-слой остался.
    await page.getByTestId("tobe-overlay-mock-ghost-toggle").click();
    await expect(asisLayer).toBeHidden();
    await expect(tobeLayer).toBeVisible();

    // 4. Выход → слоёв мока нет, сессионный слой вернулся.
    await page.getByTestId("tobe-overlay-mock-exit").click();
    mockActive = false;
    await expect(tobeLayer).toHaveCount(0);
    await expect(asisLayer).toHaveCount(0);
    const sessionLayerBack = (await page.locator(".bpmnLayer--editor").isVisible())
      || (await page.locator(".bpmnLayer--diagram").isVisible());
    expect(sessionLayerBack).toBe(true);

    // 5. Флаг off → кнопки нет.
    await setTobeOverlayMockFlag(request, auth, false);
    await page.reload();
    await waitForDiagramReady(page);
    await expect(page.getByTestId("tobe-overlay-mock-enter")).toHaveCount(0);

    // Network assert: за весь тест — ноль мутаций диаграммы; пока mock-режим
    // активен — ноль вообще любых запросов к /api/sessions/* (включая чтения
    // bpmn и presence). Шум чтений/presence только логируется для отчёта.
    expect(diagramMutations).toEqual([]);
    expect(sessionRequestsWhileMockActive).toEqual([]);
    console.log(`[tobe-overlay-mock] bpmn reads: ${bpmnReads.length}, presence deletes: ${presenceDeletes.length}`);
  });
});
