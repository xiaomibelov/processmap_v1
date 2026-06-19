import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, switchTab } from "./helpers/processFixture.mjs";

async function getCurrentUserId(request, headers) {
  const res = await request.get(`${API_BASE}/api/auth/me`, { headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  return String(body?.id || body?.user?.id || body?.user_id || "").trim();
}

test("thread header hides rare actions inside a dropdown", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request);
  const fixture = await createFixture(request, runId, auth.headers);
  const viewerUserId = await getCurrentUserId(request, auth.headers);
  const firstThreadId = `thread_${runId}_0`;

  await page.route((url) => url.pathname.includes("/note-threads"), async (route) => {
    const urlPath = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (urlPath === `/api/sessions/${fixture.sessionId}/note-threads` && method === "GET") {
      const items = Array.from({ length: 3 }, (_, i) => {
        const id = `thread_${runId}_${i}`;
        return {
          id,
          session_id: fixture.sessionId,
          project_id: fixture.projectId,
          scope_type: i === 0 ? "diagram_element" : "session",
          scope_ref: i === 0 ? { element_id: "Task_1", element_name: "Task baseline", element_type: "bpmn:Task" } : {},
          status: "open",
          priority: "normal",
          requires_attention: false,
          created_by: viewerUserId,
          unread_count: 1,
          comments: [
            {
              id: `comment_${runId}_${i}`,
              body: `Thread ${i}`,
              author_user_id: viewerUserId,
              created_at: Date.now(),
              updated_at: Date.now(),
            },
          ],
          mentions: [],
          title: `Thread ${i}`,
          body: `Body ${i}`,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items, count: items.length }),
      });
    }

    const patchMatch = urlPath.match(/^\/api\/note-threads\/([^/]+)$/);
    if (patchMatch && method === "PATCH") {
      const body = await route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, thread: { id: patchMatch[1], ...body } }),
      });
    }

    return route.continue();
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

  // Open the first thread (diagram_element scope so the focus-linked-element button is present).
  await page.getByText("Thread 0").first().click();
  await expect(page.getByTestId("notes-thread-header")).toBeVisible();

  // Right-side thread toolbar should contain only the linked-element focus button and the actions toggle.
  const focusButton = page.getByTestId("notes-thread-focus-linked-element");
  const actionsToggle = page.getByTestId("notes-thread-actions-toggle");
  await expect(focusButton).toBeVisible();
  await expect(actionsToggle).toBeVisible();
  await page.screenshot({ path: "/mnt/agents/output/discussion_hide_thread_header.png" });

  const toolbarButtons = await page.locator('[data-testid="notes-thread-toolbar"] button').evaluateAll((buttons) =>
    buttons.map((button) => button.innerText.trim()).filter((text) => text.length > 0),
  );
  expect(toolbarButtons, `unexpected visible text buttons in thread toolbar: ${JSON.stringify(toolbarButtons)}`).toEqual([]);

  // Open the actions dropdown and verify expected items.
  await actionsToggle.click();
  const dropdown = page.getByTestId("notes-thread-actions-menu");
  await expect(dropdown).toBeVisible();

  await expect(page.getByTestId("notes-thread-priority-low")).toBeVisible();
  await expect(page.getByTestId("notes-thread-priority-normal")).toBeVisible();
  await expect(page.getByTestId("notes-thread-priority-high")).toBeVisible();
  await expect(page.getByTestId("notes-thread-attention-toggle")).toHaveText("Требует внимания");
  await expect(page.getByTestId("notes-thread-status-resolved")).toHaveText("Закрыть обсуждение");
  await page.screenshot({ path: "/mnt/agents/output/discussion_hide_dropdown_open.png" });

  // Close the thread from the dropdown.
  const closePatchPromise = page.waitForRequest(
    (req) => req.method() === "PATCH" && req.url().includes(`/api/note-threads/${firstThreadId}`),
  );
  await page.getByTestId("notes-thread-status-resolved").click();

  // The dropdown should close and a PATCH request should be sent to close the thread.
  await expect(dropdown).not.toBeVisible();
  const closeRequest = await closePatchPromise;
  expect(await closeRequest.postDataJSON()).toMatchObject({ status: "resolved" });
});
