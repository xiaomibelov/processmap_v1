import { expect, test } from "@playwright/test";

function jsonResponse(payload, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

test("enterprise org settings: invites + audit tabs", async ({ page }) => {
  test.skip(process.env.E2E_ENTERPRISE !== "1", "Set E2E_ENTERPRISE=1 to run enterprise org settings e2e.");

  const invites = [
    {
      id: "inv_seed_1",
      org_id: "org_a",
      email: "seed@local",
      full_name: "Seed User",
      job_title: "Operator",
      role: "viewer",
      status: "pending",
      created_at: 1700000000,
      expires_at: 1999999999,
    },
  ];

  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_auth_access_token", "e2e-token");
    window.localStorage.setItem("fpc_active_org_id", "org_a");
  });

  await page.route("**/*", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method().toUpperCase();
    if (!path.startsWith("/api/")) {
      return route.continue();
    }
    if (!path.startsWith("/api/")) {
      return route.continue();
    }

    if (path === "/api/auth/me" && method === "GET") {
      return route.fulfill(jsonResponse({
        id: "u_admin",
        email: "admin@local",
        is_admin: false,
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
      return route.fulfill(jsonResponse({ api_version: 2, features: { projects: true, bpmn: true } }));
    }
    if (path === "/api/settings/llm" && method === "GET") {
      return route.fulfill(jsonResponse({ has_api_key: false, base_url: "https://api.deepseek.com" }));
    }
    if (path === "/api/projects" && method === "GET") {
      return route.fulfill(jsonResponse([]));
    }
    if (path.startsWith("/api/projects/") && path.endsWith("/sessions") && method === "GET") {
      return route.fulfill(jsonResponse([]));
    }
    if (path === "/api/orgs/org_a/members" && method === "GET") {
      return route.fulfill(jsonResponse({
        items: [
          { org_id: "org_a", user_id: "u_admin", email: "admin@local", role: "org_admin", created_at: 1700000000 },
          { org_id: "org_a", user_id: "u_view", email: "viewer@local", role: "viewer", created_at: 1700000001 },
        ],
        count: 2,
      }));
    }
    if (path === "/api/admin/organizations/org_a/invites" && method === "GET") {
      return route.fulfill(jsonResponse({ items: invites, count: invites.length }));
    }
    if (path === "/api/admin/organizations/org_a/invites" && method === "POST") {
      const payload = request.postDataJSON ? request.postDataJSON() : {};
      const row = {
        id: `inv_${Date.now()}`,
        org_id: "org_a",
        email: String(payload?.email || "").trim().toLowerCase(),
        full_name: String(payload?.full_name || "").trim(),
        job_title: String(payload?.job_title || "").trim(),
        role: String(payload?.role || "viewer").trim(),
        status: "pending",
        created_at: 1700000002,
        expires_at: 1999999999,
      };
      invites.unshift(row);
      return route.fulfill(jsonResponse({ invite: row, invite_key: "tok_dev_123", invite_token: "tok_dev_123" }));
    }
    if (path.startsWith("/api/admin/organizations/org_a/invites/") && path.endsWith("/revoke") && method === "POST") {
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/api/orgs/org_a/audit" && method === "GET") {
      return route.fulfill(jsonResponse({
        items: [
          { id: "aud_1", ts: 1700000003, actor_user_id: "u_admin", actor_email: "admin@local", action: "report.delete", entity_type: "report_version", entity_id: "rpt_1", status: "ok" },
        ],
        count: 1,
      }));
    }
    if (path === "/api/auth/logout" && method === "POST") {
      return route.fulfill(jsonResponse({ ok: true }));
    }

    return route.fulfill(jsonResponse({ ok: true }));
  });

  await page.goto("/app/org?tab=invites");

  const dialog = page.getByRole("dialog").filter({ has: page.getByText("Организация: Org A") }).last();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Инвайты" }).click();

  const modalBody = dialog.locator(".modalBody").last();
  const inviteForm = modalBody.locator("form").last();
  await inviteForm.locator("input[type='email']").fill("new.user@example.com");
  await inviteForm.getByPlaceholder("Имя").fill("Новый пользователь");
  await inviteForm.getByPlaceholder("Должность").fill("Технолог");
  await inviteForm.getByRole("button", { name: "Создать инвайт" }).click({ force: true });
  await dialog.getByRole("button", { name: "Инвайты" }).click();

  await expect
    .poll(async () => {
      const emailVisible = await dialog.getByText("new.user@local").isVisible().catch(() => false);
      const emailVisibleAlt = await dialog.getByText("new.user@example.com").isVisible().catch(() => false);
      const tokenVisible = await dialog.getByText(/Invite key:/).isVisible().catch(() => false);
      const sentVisible = await dialog.getByText(/Инвайт (создан|отправлен)/).isVisible().catch(() => false);
      return emailVisible || emailVisibleAlt || tokenVisible || sentVisible;
    })
    .toBeTruthy();

  await dialog.getByRole("button", { name: "Аудит" }).click();
  await expect(dialog.getByText("report.delete")).toBeVisible();
});
