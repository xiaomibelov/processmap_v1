import { expect, test } from "@playwright/test";

function jsonResponse(payload, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

const TEST_PROJECT = {
  id: "p_kebab_1",
  type: "project",
  name: "Проект с kebab-меню",
  status: "active",
  sessions_count: 5,
  trackable_sessions_count: 5,
  done_sessions_count: 0,
  attention_count: 0,
  reports_count: 0,
  updated_at: 1730000000,
  rollup_activity_at: 1730000000,
  dod_percent: 0,
};

const TEST_WORKSPACE = {
  id: "ws_kebab_1",
  name: "Test Workspace",
  role: "admin",
};

/**
 * Мокаем backend так, чтобы ExplorerPane отрендерил одну строку проекта.
 * Тест проверяет: клик по «···» открывает контекстное меню.
 */
test("Explorer: клик по «···» у строки проекта открывает контекстное меню", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_auth_access_token", "e2e-token");
    window.localStorage.setItem("fpc_active_org_id", "org_a");
  });

  await page.route("**/*", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method().toUpperCase();

    if (!path.startsWith("/api/")) return route.continue();

    if (path === "/api/auth/me" && method === "GET") {
      return route.fulfill(jsonResponse({
        id: "u_admin",
        email: "admin@local",
        is_admin: true,
        active_org_id: "org_a",
        default_org_id: "org_a",
        orgs: [{ org_id: "org_a", name: "Org A", role: "org_admin" }],
      }));
    }
    if (path === "/api/orgs" && method === "GET") {
      return route.fulfill(jsonResponse({
        items: [{ org_id: "org_a", name: "Org A", role: "org_admin" }],
        active_org_id: "org_a",
        default_org_id: "org_a",
      }));
    }
    if (path === "/api/meta" && method === "GET") {
      return route.fulfill(jsonResponse({ api_version: 2 }));
    }
    if (path === "/api/settings/llm" && method === "GET") {
      return route.fulfill(jsonResponse({ has_api_key: false, base_url: "https://api.deepseek.com" }));
    }
    if (path === "/api/workspaces" && method === "GET") {
      return route.fulfill(jsonResponse([TEST_WORKSPACE]));
    }
    if (path === "/api/users/me/preferences" && method === "GET") {
      return route.fulfill(jsonResponse({
        preferences: {
          "explorer.tree.collapsed": {
            [TEST_WORKSPACE.id]: [],
          },
        },
      }));
    }
    if (path === "/api/explorer" && method === "GET") {
      return route.fulfill(jsonResponse({
        workspace: TEST_WORKSPACE,
        breadcrumbs: [],
        items: [TEST_PROJECT],
      }));
    }
    if (path === "/api/deployment-notice" && method === "GET") {
      return route.fulfill(jsonResponse(null));
    }

    return route.fulfill(jsonResponse({ ok: true }));
  });

  await page.goto("/app");

  const row = page.getByTestId(`project-row-${TEST_PROJECT.id}`);
  await expect(row).toBeVisible();

  // Кнопка «···» изначально полупрозрачная, но кликабельна.
  const kebab = row.getByRole("button", { name: "Действия с проектом" });
  await expect(kebab).toBeVisible();

  await row.hover();
  await kebab.click();

  // Контекстное меню должно появиться и содержать пункт «Открыть».
  const menu = page.locator('.absolute.right-0.top-full');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button").filter({ hasText: "Открыть" }).first()).toBeVisible();
});
