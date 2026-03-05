import { expect } from "@playwright/test";

export async function openSessionInTopbar(page, fixture, options = {}) {
  const timeout = Number(options?.timeout || 45000);
  const projectId = String(fixture?.projectId || "").trim();
  const desiredSessionId = String(fixture?.sessionId || "").trim();
  await page.goto(`/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(desiredSessionId)}`);
  await page.waitForLoadState("domcontentloaded");

  const projectSelect = page.getByTestId("topbar-project-select");
  const sessionSelect = page.getByTestId("topbar-session-select");

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const orgChoice = page.getByText("Выберите организацию");
    if (await orgChoice.isVisible().catch(() => false)) {
      const firstOrgButton = page.getByRole("button", { name: /Org|Default|Организац/i }).first();
      if (await firstOrgButton.count()) {
        await firstOrgButton.click().catch(() => {});
      }
    }
    await page.evaluate(({ pid, sid }) => {
      const projectSelectEl = document.querySelector("[data-testid='topbar-project-select']");
      if (projectSelectEl && projectSelectEl instanceof HTMLSelectElement) {
        const hasProject = Array.from(projectSelectEl.options || []).some((opt) => String(opt?.value || "").trim() === pid);
        if (hasProject && String(projectSelectEl.value || "").trim() !== pid) {
          projectSelectEl.value = pid;
          projectSelectEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      const sessionSelectEl = document.querySelector("[data-testid='topbar-session-select']");
      if (sessionSelectEl && sessionSelectEl instanceof HTMLSelectElement) {
        const values = Array.from(sessionSelectEl.options || [])
          .map((opt) => String(opt?.value || "").trim())
          .filter(Boolean);
        const target = values.includes(sid) ? sid : (values.length === 1 ? values[0] : "");
        if (target && String(sessionSelectEl.value || "").trim() !== target) {
          sessionSelectEl.value = target;
          sessionSelectEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }, { pid: projectId, sid: desiredSessionId });
    const selected = await sessionSelect.inputValue().catch(() => "");
    if (String(selected || "").trim()) break;
    await page.waitForTimeout(250);
  }

  const selectedAfterLoop = String(await sessionSelect.inputValue().catch(() => "") || "").trim();
  if (!selectedAfterLoop) {
    const openLatestButton = page.getByRole("button", { name: /Открыть последнюю|Open latest/i }).first();
    if (await openLatestButton.isVisible().catch(() => false)) {
      await openLatestButton.click({ force: true }).catch(() => {});
    } else {
      const openAnySessionButton = page.getByTestId("workspace-open-session").first();
      if (await openAnySessionButton.isVisible().catch(() => false)) {
        await openAnySessionButton.click({ force: true }).catch(() => {});
      }
    }
    await expect
      .poll(() => sessionSelect.inputValue().catch(() => ""), { timeout: 15000 })
      .not.toBe("");
  }

  await expect(projectSelect).toBeVisible({ timeout });
  await expect(sessionSelect).toBeVisible({ timeout });
}

export async function waitForDiagramReady(page, options = {}) {
  const timeout = Number(options?.timeout || 45000);
  await expect
    .poll(async () => {
      const sentinelVisible = await page
        .locator("[data-testid='diagram-ready']")
        .isVisible()
        .catch(() => false);
      if (sentinelVisible) return true;
      try {
        return await page.evaluate(() => {
          if (window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.()) return true;
          return Boolean(
            document.querySelector(".bpmnStageHost .djs-container .djs-viewport")
            || document.querySelector(".djs-container .djs-viewport"),
          );
        });
      } catch {
        return false;
      }
    }, { timeout, message: "diagram/modeler readiness timeout" })
    .toBeTruthy();
}
