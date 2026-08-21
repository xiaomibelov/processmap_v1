import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "admin";

test("auth guard redirects /app and opens login modal", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/\?next=/);

  await page.getByRole("button", { name: "Войти" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Вход" });
  await expect(dialog).toBeVisible();
});

test("auth login from modal redirects to /app", async ({ page }) => {
  test.skip(process.env.E2E_AUTH_LOGIN !== "1", "Set E2E_AUTH_LOGIN=1 and valid admin credentials to run login assertion.");

  await page.goto("/app");
  await expect(page).toHaveURL(/\/\?next=/);

  await page.getByRole("button", { name: "Войти" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Вход" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Email").fill(ADMIN_EMAIL);
  await dialog.getByLabel("Пароль").fill(ADMIN_PASSWORD);
  await dialog.getByRole("button", { name: "Войти" }).first().click();

  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
});
