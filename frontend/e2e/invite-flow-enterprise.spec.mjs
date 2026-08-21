import { expect, test } from "@playwright/test";

function jsonResponse(payload, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

test("admin creates invite -> user enters key -> activates -> auto-login -> /app", async ({ browser }) => {
  test.skip(process.env.E2E_ENTERPRISE !== "1", "Set E2E_ENTERPRISE=1 to run enterprise invite flow e2e.");

  let inviteKey = "";
  let inviteUsed = false;

  async function wireApi(context, { initialToken = "" } = {}) {
    await context.addInitScript((token) => {
      if (token) {
        window.localStorage.setItem("fpc_auth_access_token", token);
        window.localStorage.setItem("fpc_active_org_id", "org_a");
      } else {
        window.localStorage.removeItem("fpc_auth_access_token");
        window.localStorage.removeItem("fpc_active_org_id");
      }
    }, initialToken);

    await context.route("**/*", async (route, request) => {
      const url = new URL(request.url());
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const method = request.method().toUpperCase();
      if (!path.startsWith("/api/")) return route.continue();

      const authHeader = String(request.headers().authorization || "");
      const isAdmin = authHeader === "Bearer admin-token";
      const isInvited = authHeader === "Bearer activated-token";

      if (path === "/api/auth/refresh" && method === "POST") {
        if (isAdmin) return route.fulfill(jsonResponse({ access_token: "admin-token", token_type: "bearer" }));
        if (isInvited || inviteUsed) return route.fulfill(jsonResponse({ access_token: "activated-token", token_type: "bearer" }));
        return route.fulfill(jsonResponse({ detail: "missing_refresh_token" }, 401));
      }

      if (path === "/api/auth/me" && method === "GET") {
        if (isAdmin) {
          return route.fulfill(jsonResponse({
            id: "u_admin",
            email: "admin@local",
            is_admin: false,
            active_org_id: "org_a",
            default_org_id: "org_a",
            orgs: [{ org_id: "org_a", name: "Org A", role: "org_admin" }],
          }));
        }
        if (isInvited || inviteUsed) {
          return route.fulfill(jsonResponse({
            id: "u_invited",
            email: "new.user@example.com",
            is_admin: false,
            active_org_id: "org_a",
            default_org_id: "org_a",
            orgs: [{ org_id: "org_a", name: "Org A", role: "viewer" }],
          }));
        }
        return route.fulfill(jsonResponse({ detail: "unauthorized" }, 401));
      }

      if (path === "/api/orgs" && method === "GET") {
        if (isAdmin) {
          return route.fulfill(jsonResponse({
            items: [{ org_id: "org_a", name: "Org A", role: "org_admin" }],
            active_org_id: "org_a",
            default_org_id: "org_a",
          }));
        }
        if (isInvited || inviteUsed) {
          return route.fulfill(jsonResponse({
            items: [{ org_id: "org_a", name: "Org A", role: "viewer" }],
            active_org_id: "org_a",
            default_org_id: "org_a",
          }));
        }
        return route.fulfill(jsonResponse({ items: [], active_org_id: "", default_org_id: "" }));
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
      if (path === "/api/admin/orgs" && method === "GET") {
        return route.fulfill(jsonResponse({
          items: [{ org_id: "org_a", name: "Org A", role: "org_admin" }],
          count: 1,
          active_org_id: "org_a",
        }));
      }
      if (path.startsWith("/api/projects/") && path.endsWith("/sessions") && method === "GET") {
        return route.fulfill(jsonResponse([]));
      }
      if (path === "/api/orgs/org_a/members" && method === "GET") {
        return route.fulfill(jsonResponse({
          items: [
            { org_id: "org_a", user_id: "u_admin", email: "admin@local", role: "org_admin", created_at: 1700000000 },
            { org_id: "org_a", user_id: "u_invited", email: "new.user@example.com", role: "viewer", created_at: 1700000001 },
          ],
          count: 2,
        }));
      }
      if (path === "/api/admin/organizations/org_a/invites" && method === "GET") {
        const items = inviteKey ? [{
          id: "inv_1",
          org_id: "org_a",
          email: "new.user@example.com",
          full_name: "Новый пользователь",
          job_title: "Технолог",
          status: inviteUsed ? "used" : "pending",
          created_at: 1700000002,
          expires_at: 1999999999,
          used_at: inviteUsed ? 1700000030 : null,
        }] : [];
        return route.fulfill(jsonResponse({ items, count: items.length }));
      }
      if (path === "/api/admin/organizations/org_a/invites" && method === "POST") {
        inviteKey = "inv_key_demo_123";
        return route.fulfill(jsonResponse({
          invite: {
            id: "inv_1",
            org_id: "org_a",
            email: "new.user@example.com",
            full_name: "Новый пользователь",
            job_title: "Технолог",
            status: "pending",
            created_at: 1700000002,
            expires_at: 1999999999,
          },
          invite_key: inviteKey,
          delivery: "token",
        }));
      }
      if (path === "/api/invite/resolve" && method === "POST") {
        const body = request.postDataJSON ? request.postDataJSON() : {};
        const key = String(body?.invite_key || body?.key || body?.token || "").trim();
        if (!inviteKey || key !== inviteKey) {
          return route.fulfill(jsonResponse({ error: { message: "invite_not_found" } }, 404));
        }
        return route.fulfill(jsonResponse({
          invite: {
            id: "inv_1",
            org_id: "org_a",
            org_name: "Org A",
            email: "new.user@example.com",
            full_name: "Новый пользователь",
            job_title: "Технолог",
            status: inviteUsed ? "used" : "pending",
            expires_at: 1999999999,
            invite_key: inviteKey,
          },
          identity: {
            login: "new.user@example.com",
            email: "new.user@example.com",
            state: "pending",
            readonly: true,
          },
          activation_allowed: !inviteUsed,
        }));
      }
      if (path === "/api/invite/activate" && method === "POST") {
        const body = request.postDataJSON ? request.postDataJSON() : {};
        const key = String(body?.invite_key || body?.key || body?.token || "").trim();
        const password = String(body?.password || "");
        const passwordConfirm = String(body?.password_confirm || "");
        if (!inviteKey || key !== inviteKey) {
          return route.fulfill(jsonResponse({ error: { message: "invite_not_found" } }, 404));
        }
        if (password !== passwordConfirm) {
          return route.fulfill(jsonResponse({ error: { message: "password_mismatch" } }, 422));
        }
        inviteUsed = true;
        return route.fulfill(jsonResponse({
          access_token: "activated-token",
          token_type: "bearer",
          invite: {
            id: "inv_1",
            org_id: "org_a",
            email: "new.user@example.com",
            full_name: "Новый пользователь",
            job_title: "Технолог",
            status: "used",
            used_at: 1700000030,
          },
          membership: { org_id: "org_a", user_id: "u_invited", role: "viewer" },
          user: { id: "u_invited", email: "new.user@example.com" },
        }));
      }
      if (path === "/api/auth/logout" && method === "POST") {
        return route.fulfill(jsonResponse({ ok: true }));
      }

      return route.fulfill(jsonResponse({ ok: true }));
    });
  }

  const adminContext = await browser.newContext();
  await wireApi(adminContext, { initialToken: "admin-token" });
  const adminPage = await adminContext.newPage();
  await adminPage.goto("/admin/orgs");
  await expect(adminPage.getByRole("heading", { name: "Организации" })).toBeVisible();
  await adminPage.locator("input[type='email']").fill("new.user@example.com");
  await adminPage.getByPlaceholder("Имя").fill("Новый пользователь");
  await adminPage.getByPlaceholder("Должность").fill("Технолог");
  await adminPage.getByRole("button", { name: "Создать инвайт" }).click();
  await expect(adminPage.getByText(/Invite key:/)).toContainText("inv_key_demo_123");

  const guestContext = await browser.newContext();
  await wireApi(guestContext, { initialToken: "" });
  const guestPage = await guestContext.newPage();
  await guestPage.goto("/");
  await guestPage.getByTestId("public-home-invite-mode-button").click();
  await guestPage.getByPlaceholder("inv_...").fill(inviteKey);
  await guestPage.getByRole("button", { name: "Продолжить" }).click();
  await expect(guestPage.getByText("Завершение регистрации")).toBeVisible();
  await guestPage.getByPlaceholder("Минимум 8 символов").fill("strongpass1");
  await guestPage.getByPlaceholder("Повторите пароль").fill("strongpass1");
  await guestPage.getByRole("button", { name: "Создать аккаунт и войти" }).click();
  await expect(guestPage).toHaveURL(/\/app$/);
  await expect(guestPage.getByTestId("topbar-brand-text")).toBeVisible();

  await adminContext.close();
  await guestContext.close();
});
