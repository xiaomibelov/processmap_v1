import { expect, test } from "@playwright/test";

function jsonResponse(payload, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

test("workspace dashboard opens session and enters diagram", async ({ page }) => {
  test.skip(process.env.E2E_WORKSPACE_DASH !== "1", "Set E2E_WORKSPACE_DASH=1 to run workspace dashboard smoke.");

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
        page: { limit: 50, offset: 0, total: 1 },
      }));
    }
    if (path === "/api/sessions/s_a" && method === "GET") {
      return route.fulfill(jsonResponse({
        id: "s_a",
        session_id: "s_a",
        project_id: "p_a",
        title: "Session A",
        interview: {},
        notes: [],
        bpmn_meta: {},
        bpmn_xml: "",
        nodes: [],
        edges: [],
      }));
    }
    if (path === "/api/sessions/s_a/bpmn" && method === "GET") {
      return route.fulfill(jsonResponse({ xml: "", version: 0 }));
    }
    if (path === "/api/sessions/s_a/bpmn_meta" && method === "GET") {
      return route.fulfill(jsonResponse({}));
    }

    return route.fulfill(jsonResponse({ ok: true }));
  });

  await page.goto("/app");
  await expect(page.getByTestId("workspace-dashboard")).toBeVisible();
  await page.getByTestId("workspace-open-session").first().click();
  await expect(page.getByTestId("workspace-dashboard")).toHaveCount(0);
  await expect(page.getByTestId("topbar-session-select")).toHaveValue("s_a");
});
