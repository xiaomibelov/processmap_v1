import { test, expect } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { createFixture, openFixture } from "./helpers/processFixture.mjs";

const runId = `sidebar_redesign_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

async function ensureOrgSelected(page, fixture) {
  const defaultOrgBtn = page.locator('button:has-text("Default")').first();
  try {
    await defaultOrgBtn.waitFor({ state: "visible", timeout: 10000 });
    await defaultOrgBtn.click();
    await page.waitForSelector("[data-testid='topbar-project-actions-button']", { timeout: 30000 });
    if (fixture) {
      await openFixture(page, fixture);
      await page.waitForSelector("[data-testid='topbar-project-actions-button']", { timeout: 30000 });
    }
  } catch {
    // org switcher not shown; proceed
  }
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

async function saveAllButton(page) {
  return page.locator(".sidebarGlobalFooter .primaryBtn").filter({ hasText: "Сохранить" });
}

async function resetAllButton(page) {
  return page.locator(".sidebarGlobalFooter .sidebarTextBtn").filter({ hasText: "Отмена" });
}

async function openAccordionSection(page, sectionId) {
  const head = page.locator(`.sidebarAccordion[data-section-id="${sectionId}"] > .sidebarAccordionHead`);
  if ((await head.getAttribute("aria-expanded").catch(() => "false")) !== "true") {
    await head.click();
    await page.waitForTimeout(400);
  }
}

async function expandPropertiesBlockByTitle(page, title) {
  const block = page.locator(".sidebarPropertiesBlock").filter({ hasText: title }).first();
  await expect(block).toBeVisible();
  const toggle = block.locator(".sidebarPropertiesBlockToggle").first();
  const expanded = await toggle.getAttribute("aria-expanded").catch(() => "false");
  if (expanded !== "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
  return block;
}

test.describe("sidebar redesign variant A", () => {
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
    auth.headers = {
      ...auth.headers,
      "X-Org-Id": auth.activeOrgId,
    };
    fixture = await createFixture(request, runId, auth.headers);
  });

  test.beforeEach(async ({ page }) => {
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId, refreshToken: auth.refreshToken });
    await openFixture(page, fixture);
    await ensureOrgSelected(page, fixture);
    await page.waitForSelector("[data-testid='topbar-project-actions-button']", { timeout: 45000 });
    await ensureSidebarOpen(page);
    await selectTaskOnCanvas(page, "Task_1");
    await openAccordionSection(page, "properties");
    await expandPropertiesBlockByTitle(page, "Операция");
  });

  test("applies redesign classes to sidebar controls", async ({ page }) => {
    await expect(page.locator("input.sidebarCheckbox")).not.toHaveCount(0);
    await expect(page.locator("input.sidebarInput")).not.toHaveCount(0);
    await expect(page.locator("select.sidebarSelect")).not.toHaveCount(0);
    await expect(page.locator("button.sidebarAddBtn")).not.toHaveCount(0);
    await expect(page.locator("button.sidebarPropertyActionBtn")).not.toHaveCount(0);
  });

  test("global footer is not rendered when nothing is dirty", async ({ page }) => {
    await expect(page.locator(".sidebarGlobalFooter")).toHaveCount(0);
  });

  test("display settings select toggles and does not spuriously show the global footer", async ({ page }) => {
    const select = page.getByTestId("overlay-v2-mode-select");
    await expect(select).toHaveValue("none");

    await select.selectOption("all");
    await expect(select).toHaveValue("all");

    // V2/display-mode changes persist locally — they are NOT unsaved element
    // changes, so the floating save bar must stay hidden.
    await expect(page.locator(".sidebarGlobalFooter")).toHaveCount(0);

    await select.selectOption("none");
    await expect(select).toHaveValue("none");
  });

  test("input change shows the footer and save all persists the change", async ({ page }) => {
    const docBlock = await expandPropertiesBlockByTitle(page, "BPMN Documentation");
    const addBtn = docBlock.locator("button.sidebarAddBtn").filter({ hasText: "Добавить Documentation" });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    const textarea = docBlock.locator("textarea.sidebarInput").first();
    await expect(textarea).toBeVisible();
    await textarea.fill("E2E redesign doc");

    const saveBtn = await saveAllButton(page);
    const resetBtn = await resetAllButton(page);
    await expect(saveBtn).toBeEnabled();
    await expect(resetBtn).toBeEnabled();

    await saveBtn.click();
    // Saved: no pending changes — the floating bar hides again.
    await expect(page.locator(".sidebarGlobalFooter")).toHaveCount(0, { timeout: 20000 });
  });
});
