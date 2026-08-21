import { expect, test } from "@playwright/test";

function jsonResponse(payload, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

test("admin orgs/users/invites page stays coherent", async ({ page }) => {
  let users = [
    {
      id: "u_admin",
      email: "admin@local",
      is_active: true,
      is_admin: true,
      memberships: [],
    },
    {
      id: "u_invited",
      email: "invite.user@example.com",
      is_active: true,
      is_admin: false,
      memberships: [{ org_id: "org_a", org_name: "Org A", role: "editor" }],
    },
  ];
  let invites = [
    {
      id: "inv_1",
      org_id: "org_a",
      email: "pending.user@example.com",
      full_name: "Pending User",
      job_title: "Technologist",
      role: "org_viewer",
      status: "pending",
      created_at: 1700000000,
      expires_at: 1700600000,
      used_at: null,
    },
  ];

  await page.addInitScript(() => {
    window.localStorage.setItem("fpc_auth_access_token", "admin-token");
    window.localStorage.setItem("fpc_active_org_id", "org_a");
  });

  await page.route("**/*", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method().toUpperCase();
    if (!path.startsWith("/api/")) return route.continue();

    if (path === "/api/auth/refresh" && method === "POST") {
      return route.fulfill(jsonResponse({ access_token: "admin-token", token_type: "bearer" }));
    }
    if (path === "/api/auth/me" && method === "GET") {
      return route.fulfill(jsonResponse({
        id: "u_admin",
        email: "admin@local",
        is_admin: true,
        active_org_id: "org_a",
        default_org_id: "org_a",
        orgs: [
          { org_id: "org_a", name: "Org A", role: "platform_admin" },
          { org_id: "org_b", name: "Org B", role: "platform_admin" },
        ],
      }));
    }
    if (path === "/api/orgs" && method === "GET") {
      return route.fulfill(jsonResponse({
        items: [
          { org_id: "org_a", name: "Org A", role: "platform_admin" },
          { org_id: "org_b", name: "Org B", role: "platform_admin" },
        ],
        active_org_id: "org_a",
        default_org_id: "org_a",
      }));
    }
    if (path === "/api/meta" && method === "GET") {
      return route.fulfill(jsonResponse({ api_version: 2, features: { projects: true, bpmn: true } }));
    }
    if (path === "/api/settings/llm" && method === "GET") {
      return route.fulfill(jsonResponse({ has_api_key: false, base_url: "https://api.example.test" }));
    }
    if (path === "/api/projects" && method === "GET") {
      return route.fulfill(jsonResponse([]));
    }
    if (path === "/api/admin/orgs" && method === "GET") {
      return route.fulfill(jsonResponse({
        ok: true,
        active_org_id: "org_a",
        count: 2,
        items: [
          {
            org_id: "org_a",
            name: "Org A",
            role: "platform_admin",
            members_count: 4,
            projects_count: 12,
            active_sessions_count: 2,
            pending_invites_count: 1,
            is_active_context: true,
          },
          {
            org_id: "org_b",
            name: "Org B",
            role: "platform_admin",
            members_count: 2,
            projects_count: 3,
            active_sessions_count: 1,
            pending_invites_count: 0,
            is_active_context: false,
          },
        ],
      }));
    }
    if (path === "/api/admin/users" && method === "GET") {
      return route.fulfill(jsonResponse({ ok: true, items: users, count: users.length }));
    }
    if (path === "/api/admin/users" && method === "POST") {
      const body = request.postDataJSON();
      const created = {
        id: "u_new",
        email: String(body?.email || ""),
        is_active: Boolean(body?.is_active),
        is_admin: Boolean(body?.is_admin),
        memberships: Array.isArray(body?.memberships) ? body.memberships.map((row) => ({
          ...row,
          org_name: row.org_id === "org_a" ? "Org A" : "Org B",
        })) : [],
      };
      users = [...users, created];
      return route.fulfill(jsonResponse({ ok: true, item: created }, 201));
    }
    if (path === "/api/admin/users/u_invited" && method === "PATCH") {
      const body = request.postDataJSON();
      users = users.map((row) => (
        row.id !== "u_invited"
          ? row
          : {
            ...row,
            is_active: Boolean(body?.is_active ?? row.is_active),
            memberships: Array.isArray(body?.memberships) ? body.memberships.map((item) => ({
              ...item,
              org_name: item.org_id === "org_a" ? "Org A" : "Org B",
            })) : row.memberships,
          }
      ));
      return route.fulfill(jsonResponse({ ok: true, item: users.find((row) => row.id === "u_invited") }));
    }
    if (path === "/api/orgs/org_a/invites" && method === "GET") {
      return route.fulfill(jsonResponse({ items: invites, count: invites.length }));
    }
    if (path === "/api/orgs/org_a/invites" && method === "POST") {
      const body = request.postDataJSON();
      invites = [{
        id: `inv_${invites.length + 1}`,
        org_id: "org_a",
        email: String(body?.email || ""),
        full_name: String(body?.full_name || ""),
        job_title: String(body?.job_title || ""),
        role: String(body?.role || "org_viewer"),
        status: "pending",
        created_at: 1700001234,
        expires_at: 1700601234,
        used_at: null,
      }, ...invites];
      return route.fulfill(jsonResponse({ ok: true, invite: invites[0], delivery: "email" }, 201));
    }
    if (path.startsWith("/api/orgs/org_a/invites/") && path.endsWith("/revoke") && method === "POST") {
      return route.fulfill(jsonResponse({ ok: true }));
    }

    return route.fulfill(jsonResponse({ ok: true }));
  });

  await page.goto("/admin/orgs");
  await expect(page.getByRole("heading", { name: "Организации" })).toBeVisible();
  await expect(page.getByText("invite.user@example.com")).toBeVisible();
  await expect(page.getByText("Все организации")).toBeVisible();

  const emailInput = page.locator("input[name='admin_user_email']");
  await expect(emailInput).toHaveValue("");
  await expect(page.getByText("Администратор платформы")).toBeVisible();
  await expect(page.getByText("Доступ по организациям")).toBeVisible();
  await expect(page.getByText("Роль в организации")).toBeVisible();

  await emailInput.fill("new.user@example.com");
  await page.locator("input[name='admin_user_password']").fill("strongpass1");
  await page.getByRole("button", { name: "Создать пользователя" }).click();
  await expect(page.getByText("Пользователь создан.")).toBeVisible();
  await expect(page.getByText("new.user@example.com")).toBeVisible();

  await page.getByText("invite.user@example.com").click();
  await page.getByLabel("Роль в организации").selectOption("org_admin");
  await page.getByRole("button", { name: "Сохранить пользователя" }).click();
  await expect(page.getByText("Пользователь обновлён.")).toBeVisible();
  await expect(page.getByText("Org A (Администратор · роль в организации)")).toBeVisible();

  await expect(page.getByText("Срок действия, дней")).toBeVisible();
  await expect(page.locator("text=Invite key")).toHaveCount(0);
  await page.getByPlaceholder("Email сотрудника").fill("new.invite@example.com");
  await page.getByPlaceholder("Имя").fill("New Invite");
  await page.getByPlaceholder("Должность").fill("Operator");
  await page.getByRole("button", { name: "Создать инвайт" }).click();
  await expect(page.getByText("Инвайт отправлен по email.")).toBeVisible();

  await expect(page.getByRole("cell", { name: "4" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "12" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "1" })).toBeVisible();
});
