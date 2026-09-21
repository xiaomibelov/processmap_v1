import { test, expect } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { createFixture, openFixture } from "./helpers/processFixture.mjs";

// F-SIDEBAR-OVERLAP: кнопка «+ Добавить BPMN-свойство» перекрывалась
// accordion head «Пути и последовательность» из-за grid-collapse, который
// держит контент свёрнутого аккордеона смонтированным с visibility:visible.
const runId = `sidebar_overlap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function ensureOrgSelected(page) {
  const defaultOrgBtn = page.getByRole("button", { name: /^Default/ }).first();
  try {
    await defaultOrgBtn.waitFor({ state: "visible", timeout: 10000 });
    // колонка org-picker центрирована трансформом и может быть выше viewport —
    // временно увеличиваем высоту, кликаем реальной мышью, возвращаем размер
    const vp = page.viewportSize();
    if (vp) {
      await page.setViewportSize({ width: vp.width, height: 2200 });
      await page.waitForTimeout(300);
    }
    const box = await defaultOrgBtn.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if (vp) await page.setViewportSize(vp);
  } catch (err) {
    // org switcher not shown; proceed. Если пикер реально сломан,
    // тест упадёт ниже на waitForSelector(Task_1) с этой причиной в логе.
    console.warn("ensureOrgSelected: org click skipped:", String(err).slice(0, 120));
  }
  await page.waitForSelector('.djs-shape[data-element-id="Task_1"]', { timeout: 45000 });
}

async function ensureSidebarOpen(page) {
  const handle = page.locator('[data-testid="left-sidebar-handle"]');
  if (await handle.isVisible().catch(() => false)) {
    await handle.locator(".leftSidebarHandleOpenBtn").first().click();
    await page.waitForTimeout(300);
  }
}

async function selectTaskOnCanvas(page, elementId = "Task_1") {
  const shape = page.locator(`.djs-shape[data-element-id="${elementId}"]`).first();
  await expect(shape).toBeVisible({ timeout: 20000 });
  await shape.click({ force: true });
  await page.waitForTimeout(500);
}

function propertiesHead(page) {
  return page.locator('.sidebarAccordion[data-section-id="properties"] > .sidebarAccordionHead');
}

async function openPropertiesAccordion(page) {
  const head = propertiesHead(page);
  await expect(head).toBeVisible();
  if ((await head.getAttribute("aria-expanded")) !== "true") {
    await head.click();
    await page.waitForTimeout(400);
  }
  await expect(head).toHaveAttribute("aria-expanded", "true");
}

function bpmnAddButton(page) {
  return page
    .locator("button.sidebarAddBtn")
    .filter({ hasText: "Добавить BPMN-свойство" })
    .first();
}

test.describe("sidebar add-property overlap (F-SIDEBAR-OVERLAP)", () => {
  let auth;
  let fixture;

  test.beforeAll(async ({ request }) => {
    auth = await apiLogin(request);
    const orgsRes = await request.get(`${process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011"}/api/orgs`, {
      headers: auth.headers,
    });
    const orgsBody = await orgsRes.json().catch(() => ({}));
    const orgs = Array.isArray(orgsBody) ? orgsBody : (orgsBody.items || []);
    const activeOrg = orgs.find((o) => o.is_active) || orgs[0] || {};
    auth.activeOrgId = String(activeOrg?.org_id || activeOrg?.id || auth.activeOrgId || "").trim();
    auth.headers = { ...auth.headers, "X-Org-Id": auth.activeOrgId };
    fixture = await createFixture(request, runId, auth.headers);
  });

  test.beforeEach(async ({ page }) => {
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId, refreshToken: auth.refreshToken });
    await openFixture(page, fixture);
    await ensureOrgSelected(page);
    await ensureSidebarOpen(page);
    await selectTaskOnCanvas(page, "Task_1");
    await openPropertiesAccordion(page);
  });

  test("user scenario: real click on «+ Добавить BPMN-свойство» adds a property row", async ({ page }) => {
    // Parity/regression-gate: заявленный владельцем пользовательский сценарий
    // в settled open-state. RED-доказательство контура несут unit
    // (sidebarAccordionVisibility.test.mjs) и test2 ниже — оба падают без патча;
    // этот тест фиксирует, что фикс не ломает штатный путь.
    const rows = page.locator(".sidebarSchemaPropertyRow");
    const rowsBefore = await rows.count();
    const addBtn = bpmnAddButton(page);
    await expect(addBtn).toBeVisible();
    // Реальный клик (actionability checks Playwright): если кнопка перекрыта
    // другим элементом, click падает по таймауту — это и есть гейт.
    await addBtn.click();
    await expect.poll(() => rows.count()).toBeGreaterThan(rowsBefore);
  });

  test("collapsed «Свойства» accordion removes add button from hit-testing and focus", async ({ page }) => {
    const addBtn = bpmnAddButton(page);
    await expect(addBtn).toBeVisible();

    await propertiesHead(page).click();
    await expect(propertiesHead(page)).toHaveAttribute("aria-expanded", "false");
    await page.waitForTimeout(400); // дождаться transition 0.22s

    const state = await addBtn.evaluate((btn) => {
      const cs = window.getComputedStyle(btn);
      const r = btn.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        visibility: cs.visibility,
        hitIsButton: top === btn || btn.contains(top),
      };
    });
    expect(state.visibility).toBe("hidden");
    expect(state.hitIsButton).toBe(false);
  });
});
