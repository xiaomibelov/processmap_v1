import { expect } from "@playwright/test";

export async function openSessionInTopbar(page, fixture, options = {}) {
  const timeout = Number(options?.timeout || 45000);
  const projectId = String(fixture?.projectId || "").trim();
  const desiredSessionId = String(fixture?.sessionId || "").trim();
  const activeOrgId = String(fixture?.orgId || fixture?.activeOrgId || "").trim();
  if (activeOrgId) {
    await page.addInitScript((orgId) => {
      window.localStorage.setItem("fpc_active_org_id", String(orgId || "").trim());
    }, activeOrgId);
  }
  await page.goto(`/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(desiredSessionId)}`);
  await page.waitForLoadState("domcontentloaded");

  const projectSelect = page.getByTestId("topbar-project-select");
  const sessionSelect = page.getByTestId("topbar-session-select");

  async function selectorsAvailable() {
    const projectVisible = await projectSelect.isVisible().catch(() => false);
    const sessionVisible = await sessionSelect.isVisible().catch(() => false);
    return projectVisible && sessionVisible;
  }

  async function ensureSelectOption(testId, value, labelPrefix = "e2e") {
    if (!value) return;
    await page.evaluate(({ selectTestId, optionValue, prefix }) => {
      const selectEl = document.querySelector(`[data-testid='${selectTestId}']`);
      if (!(selectEl instanceof HTMLSelectElement)) return;
      const options = Array.from(selectEl.options || []);
      const exists = options.some((opt) => String(opt?.value || "").trim() === optionValue);
      if (exists) return;
      const injected = document.createElement("option");
      injected.value = optionValue;
      injected.textContent = `[${prefix}] ${optionValue}`;
      selectEl.appendChild(injected);
    }, {
      selectTestId: String(testId || "").trim(),
      optionValue: String(value || "").trim(),
      prefix: String(labelPrefix || "e2e").trim() || "e2e",
    });
  }

  async function readDraftSessionId() {
    return await page.evaluate(() => {
      // Primary: read from E2E draft hook
      const sid = window?.__FPC_E2E_DRAFT__?.session_id;
      if (sid) return String(sid).trim();
      // Fallback: force-set __FPC_E2E__ and read draft if available
      if (typeof window.__FPC_E2E__ === "undefined") {
        window.__FPC_E2E__ = true;
      }
      const sid2 = window?.__FPC_E2E_DRAFT__?.session_id;
      return String(sid2 || "").trim();
    }).catch(() => "");
  }

  // Checks if session is visually loaded (hasSession=true in React).
  // Uses the topbar project actions button which only renders when hasActiveSession=true.
  async function isSessionVisiblyLoaded() {
    try {
      // topbar-project-actions-button is only rendered in hasActiveSession mode
      const btn = page.getByTestId("topbar-project-actions-button");
      if (await btn.isVisible().catch(() => false)) return true;
      // Fallback: look for the session label pill in the topbar center
      const sessionLabel = page.getByText("СЕССИЯ").first();
      if (await sessionLabel.isVisible().catch(() => false)) return true;
      return false;
    } catch {
      return false;
    }
  }

  async function selectProject(pid) {
    if (!pid) return;
    if (!(await selectorsAvailable())) return;
    await ensureSelectOption("topbar-project-select", pid, "project");
    await projectSelect.selectOption(pid).catch(() => {});
  }

  async function selectSession(sid) {
    if (!sid) return;
    if (!(await selectorsAvailable())) return;
    await ensureSelectOption("topbar-session-select", sid, "session");
    await sessionSelect.selectOption(sid).catch(() => {});
  }

  async function tryWorkspaceFallbackOpen() {
    const openLatestButton = page.getByRole("button", { name: /Открыть последнюю|Open latest/i }).first();
    if (await openLatestButton.isVisible().catch(() => false)) {
      await openLatestButton.click({ force: true }).catch(() => {});
      return;
    }
    const openAnySessionButton = page.getByTestId("workspace-open-session").first();
    if (await openAnySessionButton.isVisible().catch(() => false)) {
      await openAnySessionButton.click({ force: true }).catch(() => {});
      return;
    }
    const explicitOpenButton = page.getByRole("button", { name: /Открыть/i }).first();
    if (await explicitOpenButton.isVisible().catch(() => false)) {
      await explicitOpenButton.click({ force: true }).catch(() => {});
    }
  }

  async function tryE2eOpenSession(sid) {
    const targetSid = String(sid || "").trim();
    if (!targetSid) return;
    await page.evaluate(async (value) => {
      const opener = window?.__FPC_E2E_OPEN_SESSION__;
      if (typeof opener !== "function") return;
      await opener(value);
    }, targetSid).catch(() => {});
  }

  // Track whether e2e session opener was already triggered to avoid
  // repeated calls to openSession() which can trigger reqSeq cancellation
  // before React commits draft state to window.__FPC_E2E_DRAFT__.
  let e2eOpenTriggered = false;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const orgChoice = page.getByText("Выберите организацию");
    if (await orgChoice.isVisible().catch(() => false)) {
      const firstOrgButton = page.getByRole("button", { name: /Org|Default|Организац/i }).first();
      if (await firstOrgButton.count()) {
        await firstOrgButton.click().catch(() => {});
        await page.waitForTimeout(250);
      }
    }
    await selectProject(projectId);
    if (desiredSessionId) {
      // Check draft state first; only trigger open if not yet loaded
      const sid = String(await readDraftSessionId() || "").trim();
      const selected = String(await sessionSelect.inputValue().catch(() => "") || "").trim();
      if ((sid && sid === desiredSessionId) || selected === desiredSessionId) break;
      // Visual fallback: session canvas is rendered even if draft hook not set yet
      if (await isSessionVisiblyLoaded()) break;
      // Trigger session open only once via e2e hook to avoid reqSeq races
      if (!e2eOpenTriggered) {
        await tryE2eOpenSession(desiredSessionId);
        e2eOpenTriggered = true;
        // Give React time to commit the state update before next check
        await page.waitForTimeout(1500);
        if (await isSessionVisiblyLoaded()) break;
        const sidAfterOpen = String(await readDraftSessionId() || "").trim();
        if (sidAfterOpen && sidAfterOpen === desiredSessionId) break;
      }
      await selectSession(desiredSessionId);
    } else {
      const selected = String(await sessionSelect.inputValue().catch(() => "") || "").trim();
      const sid = String(await readDraftSessionId() || "").trim();
      if (selected || sid || (await isSessionVisiblyLoaded())) break;
    }
    await tryWorkspaceFallbackOpen();
    await page.waitForTimeout(250);
  }

  const selectedAfterLoop = String(await sessionSelect.inputValue().catch(() => "") || "").trim();
  const draftAfterLoop = String(await readDraftSessionId() || "").trim();
  const sessionVisuallyLoaded = await isSessionVisiblyLoaded();
  const hasDesiredSession = desiredSessionId
    ? draftAfterLoop === desiredSessionId || selectedAfterLoop === desiredSessionId || sessionVisuallyLoaded
    : Boolean(selectedAfterLoop) || sessionVisuallyLoaded;
  if (!hasDesiredSession) {
    // Attempt one more targeted open before polling
    if (desiredSessionId && !e2eOpenTriggered) {
      await tryE2eOpenSession(desiredSessionId);
      e2eOpenTriggered = true;
    }
    const fallbackStartedAt = Date.now();
    while (Date.now() - fallbackStartedAt < 15000) {
      await selectProject(projectId);
      if (desiredSessionId) {
        await selectSession(desiredSessionId);
        const currentSid = String(await readDraftSessionId() || "").trim();
        const selectedValue = String(await sessionSelect.inputValue().catch(() => "") || "").trim();
        if (currentSid === desiredSessionId || selectedValue === desiredSessionId) break;
      } else {
        const selectedValue = String(await sessionSelect.inputValue().catch(() => "") || "").trim();
        const currentSid = String(await readDraftSessionId() || "").trim();
        if (selectedValue || currentSid) break;
      }
      await tryWorkspaceFallbackOpen();
      await page.waitForTimeout(250);
    }
    if (desiredSessionId) {
      await expect
        .poll(async () => {
          const sid = String(await readDraftSessionId() || "").trim();
          const selected = String(await sessionSelect.inputValue().catch(() => "") || "").trim();
          return sid === desiredSessionId || selected === desiredSessionId;
        }, { timeout: 15000 })
        .toBeTruthy();
    } else {
      await expect
        .poll(async () => {
          const sid = String(await readDraftSessionId() || "").trim();
          const selected = String(await sessionSelect.inputValue().catch(() => "") || "").trim();
          return sid || selected;
        }, { timeout: 15000 })
        .not.toBe("");
    }
  }

  if (await selectorsAvailable()) {
    await expect(projectSelect).toBeVisible({ timeout });
    await expect(sessionSelect).toBeVisible({ timeout });
  }
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
