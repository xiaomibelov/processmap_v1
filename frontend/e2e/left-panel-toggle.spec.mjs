import { expect, test } from "@playwright/test";

async function readLayout(page) {
  return await page.evaluate(() => {
    const workspace = document.querySelector(".workspace");
    const left = document.querySelector(".workspaceLeft");
    const main = document.querySelector(".workspaceMain");
    const leftRect = left?.getBoundingClientRect?.() || { width: 0 };
    const mainRect = main?.getBoundingClientRect?.() || { width: 0 };
    return {
      workspaceClass: String(workspace?.className || ""),
      leftClass: String(left?.className || ""),
      leftW: Math.round(Number(leftRect.width || 0)),
      mainW: Math.round(Number(mainRect.width || 0)),
      persisted: String(window.localStorage.getItem("fpc_leftpanel_hidden") || ""),
    };
  });
}

test("left panel toggle hides, expands main area and persists", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".topbar")).toBeVisible();

  const toggleBtn = page.locator('button[title="Скрыть меню"],button[title="Показать меню"]').first();
  await expect(toggleBtn).toBeVisible();

  const before = await readLayout(page);
  expect(before.workspaceClass).not.toContain("workspace--leftHidden");
  expect(before.leftW).toBeGreaterThan(200);

  await toggleBtn.click();
  await expect(page.locator(".workspace.workspace--leftHidden")).toBeVisible();

  const collapsed = await readLayout(page);
  expect(collapsed.leftW).toBeLessThanOrEqual(1);
  expect(collapsed.mainW).toBeGreaterThan(before.mainW + 120);
  expect(collapsed.persisted).toBe("1");

  await page.reload();
  await expect(page.locator(".workspace.workspace--leftHidden")).toBeVisible();
  const reloaded = await readLayout(page);
  expect(reloaded.persisted).toBe("1");
  expect(reloaded.leftW).toBeLessThanOrEqual(1);

  await toggleBtn.click();
  await expect(page.locator(".workspace.workspace--leftHidden")).toHaveCount(0);
  const restored = await readLayout(page);
  expect(restored.persisted).toBe("0");
  expect(restored.leftW).toBeGreaterThan(200);
});
