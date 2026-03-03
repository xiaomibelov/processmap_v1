import { expect, test } from "@playwright/test";

function jsonResponse(payload, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

test("multi-org user selects org and requests are scoped by X-Org-Id", async ({ page }) => {
  test.skip(process.env.E2E_ORG_SWITCH !== "1", "Set E2E_ORG_SWITCH=1 to run org switcher e2e.");
  const seenProjectHeaders = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_auth_access_token", "e2e-token");
    window.localStorage.removeItem("fpc_active_org_id");
    window.sessionStorage.removeItem("fpc_org_choice_done:u_multi");
  });

  await page.route("**/api/**", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();
    const headers = request.headers();

    if (path === "/api/auth/me" && method === "GET") {
      return route.fulfill(jsonResponse({
        id: "u_multi",
        email: "multi@local",
        is_admin: false,
        active_org_id: "org_a",
        default_org_id: "org_a",
        orgs: [
          { org_id: "org_a", name: "Org A", role: "editor" },
          { org_id: "org_b", name: "Org B", role: "org_admin" },
        ],
      }));
    }
    if (path === "/api/meta" && method === "GET") {
      return route.fulfill(jsonResponse({
        api_version: 2,
        features: { bpmn: true, projects: true },
      }));
    }
    if (path === "/api/settings/llm" && method === "GET") {
      return route.fulfill(jsonResponse({
        has_api_key: false,
        base_url: "https://api.deepseek.com",
      }));
    }
    if (path === "/api/projects" && method === "GET") {
      seenProjectHeaders.push(String(headers["x-org-id"] || ""));
      return route.fulfill(jsonResponse([]));
    }
    if (path.startsWith("/api/projects/") && path.endsWith("/sessions") && method === "GET") {
      return route.fulfill(jsonResponse([]));
    }
    if (path === "/api/auth/logout" && method === "POST") {
      return route.fulfill(jsonResponse({ ok: true }));
    }

    return route.fulfill(jsonResponse({ ok: true }));
  });

  await page.goto("/app");
  await expect(page.getByText("Выберите организацию")).toBeVisible();
  await page.getByRole("button", { name: "Org B" }).click();

  await expect(page.locator("[data-testid='topbar-org-select']")).toBeVisible();
  await expect(page.locator("[data-testid='topbar-org-select']")).toHaveValue("org_b");
  await expect.poll(() => seenProjectHeaders.includes("org_b")).toBeTruthy();
});
