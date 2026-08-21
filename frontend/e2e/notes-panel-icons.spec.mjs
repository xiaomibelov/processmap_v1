import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, switchTab } from "./helpers/processFixture.mjs";

async function getCurrentUserId(request, headers) {
  const res = await request.get(`${API_BASE}/api/auth/me`, { headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  return String(body?.id || body?.user?.id || body?.user_id || "").trim();
}

test("discussion panel header uses icon buttons with tooltips and notification badge", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers);
  const viewerUserId = await getCurrentUserId(request, auth.headers);

  await page.route((url) => url.pathname.includes("/note-threads"), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: Array.from({ length: 3 }, (_, i) => ({
          id: `thread_${runId}_${i}`,
          session_id: fixture.sessionId,
          project_id: fixture.projectId,
          scope_type: "session",
          scope_ref: {},
          status: "open",
          priority: "normal",
          requires_attention: false,
          created_by: viewerUserId,
          unread_count: 1,
          comments: [
            {
              id: `comment_${runId}_${i}`,
              body: `Thread ${i}`,
              author_user_id: "other_user",
              created_at: Date.now(),
              updated_at: Date.now(),
            },
          ],
          mentions: [],
          title: `Thread ${i}`,
          body: `Body ${i}`,
          created_at: Date.now(),
          updated_at: Date.now(),
        })),
        count: 3,
      }),
    });
  });

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });

  await page.goto(`/app?project=${fixture.projectId}&session=${fixture.sessionId}`);
  try {
    await page.locator("h1:has-text('Выберите организацию')").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("button").filter({ has: page.locator("div", { hasText: "Default" }) }).first().click();
  } catch {
    // org chooser not shown
  }
  await expect.poll(async () => page.url()).toContain(`session=${encodeURIComponent(fixture.sessionId)}`);

  await switchTab(page, "Diagram");

  const notesButton = page.getByTestId("diagram-action-notes");
  await expect(notesButton).toBeVisible();
  await notesButton.click();

  const header = page.getByTestId("notes-panel-header");
  await expect(header).toBeVisible();

  // Header secondary buttons should be icon-only (no visible text except the primary "+ Новое").
  const headerButtonsText = await header.locator("button").evaluateAll((buttons) =>
    buttons.map((button) => button.innerText.trim()),
  );
  const badgeText = await page.getByTestId("notes-notification-badge").textContent().catch(() => "");
  const nonEmptySecondary = headerButtonsText.filter(
    (text) => text.length > 0 && text !== "Новое" && text !== badgeText,
  );
  expect(nonEmptySecondary, `unexpected text buttons: ${JSON.stringify(headerButtonsText)}`).toEqual([]);

  // Threads loaded from the mocked endpoint.
  await expect(page.getByText("Thread 0").first()).toBeVisible();
  await expect(page.getByText("Thread 1").first()).toBeVisible();
  await expect(page.getByText("Thread 2").first()).toBeVisible();

  // Notification bell shows a red badge with count 3.
  const badge = page.getByTestId("notes-notification-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText("3");
  await expect(badge).toHaveCSS("background-color", /rgb\(239, 68, 68\)|rgba\(239, 68, 68/);

  // Hovering the filters toggle shows a styled tooltip.
  const filtersButton = page.getByTestId("notes-filters-toggle");
  await filtersButton.hover();
  const tooltip = page.getByTestId("icon-button-tooltip").filter({ hasText: "Фильтры" }).first();
  await expect(tooltip).toBeVisible();
});
