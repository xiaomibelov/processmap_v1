import { expect, test } from "@playwright/test";

function jsonResponse(payload, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

test("workspace home renders overview CTA and no getting started block", async ({ page }) => {
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
    if (path === "/api/projects" && method === "GET") {
      return route.fulfill(jsonResponse([{ id: "p_a", title: "Project A", created_by: "u_admin", updated_by: "u_admin" }]));
    }
    if (path === "/api/projects/p_a/sessions" && method === "GET") {
      return route.fulfill(jsonResponse([{
        id: "s_a",
        session_id: "s_a",
        project_id: "p_a",
        title: "Session A",
        created_by: "u_admin",
        updated_by: "u_admin",
      }]));
    }
    if (path === "/api/enterprise/workspace" && method === "GET") {
      return route.fulfill(jsonResponse({
        org: { id: "org_a", name: "Org A", role: "org_admin" },
        group_by: "projects",
        users: [{ id: "u_admin", email: "admin@local", name: "admin@local", project_count: 1, session_count: 1 }],
        projects: [{ id: "p_a", name: "Project A", owner_id: "u_admin", owner: "admin@local", updated_at: 1730000000, session_count: 1 }],
        sessions: [{
          id: "s_a",
          name: "Session A",
          project_id: "p_a",
          owner_id: "u_admin",
          owner: "admin@local",
          updated_at: 1730000000,
          status: "in_progress",
          reports_versions: 0,
          needs_attention: 0,
          can_view: true,
          can_edit: true,
          can_manage: true,
        }],
        page: { limit: 10, offset: 0, total: 1 },
      }));
    }

    return route.fulfill(jsonResponse({ ok: true }));
  });

  await page.goto("/app");

  await expect(page.getByTestId("workspace-dashboard")).toBeVisible();
  await expect(page.getByText("Workspace / Projects / Sessions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Project" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Session" }).first()).toBeVisible();
  await expect(page.getByText("Recent Sessions")).toBeVisible();
  await expect(page.getByTestId("workspace-open-session")).toHaveCount(2);
  await expect(page.getByText("Как начать")).toHaveCount(0);
});
