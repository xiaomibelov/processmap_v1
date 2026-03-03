import { expect, test } from "@playwright/test";

function jsonResponse(payload, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

test("accept invite link: authenticated user joins org and enters /app", async ({ page }) => {
  test.skip(process.env.E2E_ENTERPRISE !== "1", "Set E2E_ENTERPRISE=1 to run enterprise accept invite e2e.");
  page.on("pageerror", (err) => {
    throw err;
  });

  let activeOrgId = "org_a";
  const seenProjectHeaders = [];
  let inviteAccepted = false;

  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_auth_access_token", "token_accept_invite");
    window.localStorage.removeItem("fpc_active_org_id");
    window.sessionStorage.removeItem("fpc_org_choice_done:u_accept");
  });

  await page.route("**/*", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method().toUpperCase();
    if (!path.startsWith("/api/")) {
      return route.continue();
    }

    if (path === "/api/auth/login" && method === "POST") {
      return route.fulfill(jsonResponse({ access_token: "token_accept_invite", token_type: "bearer" }));
    }
    if (path === "/api/auth/me" && method === "GET") {
      return route.fulfill(jsonResponse({
        id: "u_accept",
        email: "invite.user@example.com",
        is_admin: false,
        active_org_id: activeOrgId,
        default_org_id: "org_a",
        orgs: [{ org_id: "org_a", name: "Org A", role: "editor" }],
      }));
    }
    if (path === "/api/invites/accept" && method === "POST") {
      activeOrgId = "org_b";
      inviteAccepted = true;
      return route.fulfill(jsonResponse({
        invite: { id: "inv_1", org_id: "org_b", role: "viewer", status: "accepted" },
        membership: { org_id: "org_b", user_id: "u_accept", role: "viewer" },
      }));
    }
    if (path === "/api/orgs" && method === "GET") {
      return route.fulfill(jsonResponse({
        items: [
          { org_id: "org_a", name: "Org A", role: "editor" },
          { org_id: "org_b", name: "Org B", role: "viewer" },
        ],
        active_org_id: activeOrgId,
        default_org_id: "org_a",
      }));
    }
    if (path === "/api/meta" && method === "GET") {
      return route.fulfill(jsonResponse({ api_version: 2, features: { projects: true, bpmn: true } }));
    }
    if (path === "/api/settings/llm" && method === "GET") {
      return route.fulfill(jsonResponse({ has_api_key: false, base_url: "https://api.deepseek.com" }));
    }
    if (path === "/api/projects" && method === "GET") {
      const seen = String(request.headers()["x-org-id"] || "").trim();
      seenProjectHeaders.push(seen);
      if (seen !== "org_b" && seen !== "org_a") {
        return route.fulfill(jsonResponse({ detail: "wrong_org_header" }, 400));
      }
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

  await page.goto("/accept-invite?token=tok_accept_1");
  await expect.poll(() => inviteAccepted).toBeTruthy();

  await expect.poll(() => seenProjectHeaders.includes("org_b")).toBeTruthy();
});
