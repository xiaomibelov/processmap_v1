import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// Property panel redesign (feature/property-panel-redesign).
//
// Covers TESTS.md §3 scenarios 1-7 + 10: the compact display-settings panel
// (2 dropdowns + per-field chips, replacing the 5 legacy checkboxes), mode
// persistence + legacy-key migration, chip filtering of legacy AND V2 overlay
// cards, the live overlay preview, the To-Be builder (toggle -> Pool -> add
// -> save), and basic keyboard accessibility.
// Process-level scenarios 8/9 are covered by process-properties.spec.mjs.

const PROCESS_ID = "Process_redesign";
const TASK_A = "Task_redA";
const TASK_B = "Task_redB";

function seedXmlTwoTasks() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${PROCESS_ID}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="${TASK_A}" name="Task A">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="ee_time" value="0.33" />
          <camunda:property name="ingredient_value" value="5" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:task id="${TASK_B}" name="Task B" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="${TASK_A}" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="${TASK_A}" targetRef="${TASK_B}" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="${TASK_B}" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Diagram">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${PROCESS_ID}">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1"><dc:Bounds x="120" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${TASK_A}" bpmnElement="${TASK_A}"><dc:Bounds x="220" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${TASK_B}" bpmnElement="${TASK_B}"><dc:Bounds x="430" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_EndEvent_1" bpmnElement="EndEvent_1"><dc:Bounds x="640" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="156" y="170" /><di:waypoint x="220" y="170" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="340" y="170" /><di:waypoint x="430" y="170" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="550" y="170" /><di:waypoint x="640" y="170" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

// Pre-existing on main (verified at base commit 5aabba98, 2026-07): a dev-mode
// React warning loop — useBpmnSync returns a fresh object every render, so the
// registerAppSafeRefreshHandler effect in ProcessStage re-runs per render and
// ping-pongs setState with AppShell (setRefreshRisk). Not caused by this
// feature; tracked as a separate finding in EXEC_REPORT.md. The spec filters
// ONLY this exact warning and still fails on any other console.error/pageerror.
const PRE_EXISTING_UPDATE_DEPTH_WARNING = "Maximum update depth exceeded";

function collectConsoleProblems(page) {
  const problems = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${String(err?.message || err)}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes(PRE_EXISTING_UPDATE_DEPTH_WARNING)) return;
    problems.push(`console.error: ${text}`);
  });
  return problems;
}

async function ensureSidebarOpen(page) {
  const handle = page.locator('[data-testid="left-sidebar-handle"]');
  if (await handle.isVisible().catch(() => false)) {
    await handle.locator(".leftSidebarHandleOpenBtn").first().click();
    await page.waitForTimeout(300);
  }
}

async function openPropertiesSection(page) {
  const head = page.locator('.sidebarAccordion[data-section-id="properties"] > .sidebarAccordionHead');
  await expect(head).toBeVisible({ timeout: 15_000 });
  if ((await head.getAttribute("aria-expanded").catch(() => "false")) !== "true") {
    await head.click();
    await page.waitForTimeout(300);
  }
}

async function settleOrgChooser(page) {
  const chooser = page.getByText("Выберите организацию").first();
  for (let i = 0; i < 40; i += 1) {
    if (await chooser.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /Default/i }).first().click();
      break;
    }
    if (await page.locator(".bpmnStageHost").isVisible().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
}

async function bootDiagram(page, request, runId, { extraStorage = {}, fixture: presetFixture = null } = {}) {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = presetFixture || await createFixture(request, runId, auth.headers, seedXmlTwoTasks());
  await setUiToken(page, auth.accessToken);
  const orgId = String(fixture.orgId || auth.activeOrgId || "").trim();
  await page.addInitScript(({ org, storage }) => {
    if (org) window.localStorage.setItem("fpc_active_org_id", org);
    Object.entries(storage || {}).forEach(([key, value]) => {
      window.localStorage.setItem(key, value);
    });
  }, { org: orgId, storage: extraStorage });
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await settleOrgChooser(page);
  await waitForDiagramReady(page);
  await ensureSidebarOpen(page);
  return { ...fixture, auth };
}

async function selectTask(page, taskId) {
  const result = await page.evaluate((id) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const eventBus = modeler.get("eventBus");
      const element = modeler.get("elementRegistry").get(String(id));
      if (!element) return { ok: false, error: "element_missing" };
      eventBus.fire("element.click", { element, originalEvent: { button: 0 } });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, taskId);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  await page.waitForTimeout(400);
}

async function fetchBpmnXml(request, fixture) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn`, {
    headers: fixture.auth.headers,
  });
  const xml = await res.text();
  expect(res.ok(), `GET bpmn: ${xml.slice(0, 300)}`).toBeTruthy();
  expect(xml).toContain("bpmn:definitions");
  return xml;
}

async function saveAll(page) {
  const putWait = page.waitForResponse(
    (res) => res.url().includes("/bpmn") && res.request().method() === "PUT",
    { timeout: 30_000 },
  );
  await page.locator(".sidebarGlobalFooter").getByRole("button", { name: "Сохранить", exact: true }).click();
  const putRes = await putWait;
  expect(putRes.ok(), `PUT bpmn status ${putRes.status()}`).toBeTruthy();
}

function taskBlock(xml, taskId) {
  const match = String(xml).match(new RegExp(`<bpmn:task id="${taskId}"[\\s\\S]*?</bpmn:task>`));
  expect(match, `task ${taskId} block must exist in saved XML`).toBeTruthy();
  return match[0];
}

// --- Scenario 1 (AC1, AC2): compact panel structure -------------------------

test("compact panel: 2 selects + chips + hints; legacy checkboxes gone", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `ppr_struct_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const displaySelect = page.locator('[data-testid="overlay-display-mode-select"]');
  const v2Select = page.locator('[data-testid="overlay-v2-mode-select"]');
  await expect(displaySelect).toBeVisible({ timeout: 15_000 });
  await expect(v2Select).toBeVisible();
  await expect(displaySelect.locator("option")).toHaveCount(3);
  await expect(v2Select.locator("option")).toHaveCount(3);
  await expect(displaySelect).toHaveValue("hover");
  await expect(v2Select).toHaveValue("none");

  // Chips for element + quick fields.
  await expect(page.locator('[data-testid="overlay-field-chip-ee_time"]')).toBeVisible();
  await expect(page.locator('[data-testid="overlay-field-chip-ingredient_value"]')).toBeVisible();

  // Inline hint for the default hover mode.
  await expect(page.getByText("Карточка появляется при выделении элемента")).toBeVisible();

  // The five legacy checkboxes must be gone.
  for (const testid of [
    "bpmn-show-properties-checkbox",
    "bpmn-show-properties-per-element-checkbox",
    "bpmn-show-v2-overlays-checkbox",
    "bpmn-show-v2-overlays-expanded-checkbox",
  ]) {
    await expect(page.locator(`[data-testid="${testid}"]`)).toHaveCount(0);
  }

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Scenario 2 (AC3): hover card by default + mode persistence -------------

test("hover card shows for the selected task; «Всегда» survives a reload", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `ppr_persist_${runId}`);

  await selectTask(page, TASK_A);
  // Default hover mode renders the legacy card for the selected element.
  await expect(page.locator(".fpcPropertyOverlay")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".fpcPropertyOverlay").first()).toContainText("ee_time");

  await openPropertiesSection(page);
  await page.locator('[data-testid="overlay-display-mode-select"]').selectOption("always");

  await page.reload();
  await settleOrgChooser(page);
  await waitForDiagramReady(page);
  await ensureSidebarOpen(page);
  await selectTask(page, TASK_A);
  await openPropertiesSection(page);
  await expect(page.locator('[data-testid="overlay-display-mode-select"]')).toHaveValue("always");

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Scenario 3 (AC3): legacy localStorage key migrates into the new model --

test("legacy fpc_properties_overlay_always_v1 flag migrates to displayMode=always", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, `ppr_migrate_${runId}`, auth.headers, seedXmlTwoTasks());
  const legacyKey = `fpc_properties_overlay_always_v1:${fixture.sessionId}`;
  await bootDiagram(page, request, `ppr_migrate_${runId}`, { extraStorage: { [legacyKey]: "1" }, fixture });

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);
  await expect(page.locator('[data-testid="overlay-display-mode-select"]')).toHaveValue("always", { timeout: 15_000 });
  // Legacy key is read-only migrated — it must NOT be deleted.
  const legacyValue = await page.evaluate((key) => window.localStorage.getItem(key), legacyKey);
  expect(legacyValue).toBe("1");

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Scenario 4 (AC4): chip filters legacy AND V2 card rows -----------------

test("chip toggle hides the field from legacy and V2 cards (data untouched)", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `ppr_chips_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const card = page.locator(".fpcPropertyOverlay").first();
  await expect(card).toContainText("ee_time", { timeout: 15_000 });
  await expect(card).toContainText("ingredient_value");

  const chip = page.locator('[data-testid="overlay-field-chip-ee_time"]');
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(card).not.toContainText("ee_time", { timeout: 15_000 });
  await expect(card).toContainText("ingredient_value");

  // Same filter applies to V2 cards.
  await page.locator('[data-testid="overlay-v2-mode-select"]').selectOption("all");
  const v2HostA = page.locator(`.fpc-overlay-v2-host[data-fpc-element-id="${TASK_A}"]`);
  await expect(v2HostA).toBeVisible({ timeout: 15_000 });
  await expect(v2HostA).not.toContainText("ee_time");
  await expect(v2HostA).toContainText("ingredient_value");

  // Toggle back: the field returns (nothing was deleted).
  await chip.click();
  await expect(v2HostA).toContainText("ee_time", { timeout: 15_000 });

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Scenario 5 (AC4, AC5): V2 expanded + legacy decor cleared --------------

test("v2Mode «Раскрытые» expands V2 hosts, hides legacy display mode and restores it on off", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `ppr_v2exp_${runId}`);

  await selectTask(page, TASK_A);
  await expect(page.locator(".fpcPropertyOverlay")).toHaveCount(1, { timeout: 15_000 });

  await openPropertiesSection(page);
  const displaySelect = page.locator('[data-testid="overlay-display-mode-select"]');
  await expect(displaySelect).toHaveValue("hover");
  await expect(displaySelect).toBeEnabled();

  await page.locator('[data-testid="overlay-v2-mode-select"]').selectOption("expanded");

  await expect(page.locator(".fpc-overlay-v2-host--expanded").first()).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => page.locator(".fpcPropertyOverlay").count(), { timeout: 15_000 })
    .toBe(0);

  // V2→displayMode coupling: legacy mode is forced to «hidden» and the
  // select is locked with an explanatory hint while V2 is on.
  await expect(displaySelect).toHaveValue("hidden");
  await expect(displaySelect).toBeDisabled();
  await expect(page.locator("#overlay-display-mode-hint")).toHaveText("Скрыто автоматически: включены V2-оверлеи");

  // Turning V2 back off restores the previous display mode.
  await page.locator('[data-testid="overlay-v2-mode-select"]').selectOption("none");
  await expect(displaySelect).toHaveValue("hover", { timeout: 10_000 });
  await expect(displaySelect).toBeEnabled();

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Scenario 6 (AC6): live preview updates from the draft, no save ---------

test("live preview mirrors the draft: seeded values and inline edits (no save)", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `ppr_live_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const preview = page.locator('[data-testid="live-card-preview"]');
  await expect(preview).toBeVisible({ timeout: 15_000 });
  await expect(preview).toContainText("ee_time");
  await expect(preview).toContainText("0.33");

  // Inline-edit the value: commit on Enter (Tab stays inside the row's
  // two-input edit mode by design and does not commit), preview must follow
  // without a save.
  await page.getByLabel("Редактировать свойство ee_time").click();
  const valueInput = page.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(valueInput).toBeVisible({ timeout: 10_000 });
  await valueInput.fill("0.66");
  await valueInput.press("Enter");
  await expect(preview).toContainText("0.66", { timeout: 15_000 });
  await expect(preview).not.toContainText("0.33");

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Scenario 7 (AC7, AC8): To-Be builder end-to-end ------------------------

test("To-Be: toggle -> Pool on another task -> '+' -> draft row -> save -> XML", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await bootDiagram(page, request, `ppr_tobe_${runId}`);

  // Task A: ee_time starts as «Added» (ad-hoc); toggle it into the To-Be set.
  await selectTask(page, TASK_A);
  await openPropertiesSection(page);
  const builder = page.locator('[data-testid="to-be-builder"]');
  // UI refresh: summary pills live in the collapsible To-Be group header
  // (outside the builder body) — assert against the whole group.
  const toBeGroup = page.locator('.panelGroup[data-group="toBe"]');
  await expect(builder).toBeVisible({ timeout: 15_000 });
  await expect(toBeGroup).toContainText("0 in To-Be / 0 skipped");
  await page.locator('[data-testid="to-be-toggle-ee_time"]').click();
  await expect(toBeGroup).toContainText("1 in To-Be / 0 skipped");

  // Task B has no properties: ee_time surfaces in the Pool as «Not filled».
  await selectTask(page, TASK_B);
  await openPropertiesSection(page);
  await expect(toBeGroup).toContainText("0 in To-Be / 1 skipped", { timeout: 15_000 });
  await expect(builder.locator('[data-testid="to-be-add-ee_time"]')).toBeVisible();

  // «+» adds the field to the draft (CRUD section), pills recount.
  await builder.locator('[data-testid="to-be-add-ee_time"]').click();
  await expect(page.getByLabel("Редактировать свойство ee_time")).toBeVisible({ timeout: 10_000 });
  await expect(toBeGroup).toContainText("1 in To-Be / 0 skipped");

  // Global save persists the property into the task's extensionElements.
  await saveAll(page);
  await expect
    .poll(async () => taskBlock(await fetchBpmnXml(request, fixture), TASK_B), { timeout: 20_000 })
    .toContain('name="ee_time"');

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Scenario 10 (AC11): keyboard accessibility of chips --------------------

test("keyboard: chip toggles via Space/Enter with aria-pressed mirroring state", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `ppr_a11y_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const chip = page.locator('[data-testid="overlay-field-chip-ee_time"]');
  await expect(chip).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });

  await chip.focus();
  await page.keyboard.press("Space");
  await expect(chip).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Enter");
  await expect(chip).toHaveAttribute("aria-pressed", "true");

  // Selects are native and keyboard-operable.
  const displaySelect = page.locator('[data-testid="overlay-display-mode-select"]');
  await displaySelect.focus();
  await expect(displaySelect).toBeFocused();

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- UI refresh: collapsible panel groups with persistence ------------------

test("panel groups collapse and stay collapsed across a reload", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `ppr_groups_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const fieldsToggle = page.locator('[data-testid="panel-group-toggle-fields"]');
  await expect(fieldsToggle).toBeVisible({ timeout: 15_000 });
  await expect(fieldsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-testid="overlay-field-chip-ee_time"]')).toBeVisible();

  // Collapse «Поля в оверлее»: chips leave the DOM (body is not rendered).
  await fieldsToggle.click();
  await expect(fieldsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-testid="overlay-field-chip-ee_time"]')).toHaveCount(0);

  // The collapse survives a reload (global UI preference in localStorage).
  await page.reload();
  await settleOrgChooser(page);
  await waitForDiagramReady(page);
  await ensureSidebarOpen(page);
  await selectTask(page, TASK_A);
  await openPropertiesSection(page);
  await expect(page.locator('[data-testid="panel-group-toggle-fields"]')).toHaveAttribute("aria-expanded", "false", { timeout: 15_000 });
  await expect(page.locator('[data-testid="overlay-field-chip-ee_time"]')).toHaveCount(0);

  // Expand back: chips return.
  await page.locator('[data-testid="panel-group-toggle-fields"]').click();
  await expect(page.locator('[data-testid="overlay-field-chip-ee_time"]')).toBeVisible({ timeout: 10_000 });

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- UI refresh: extension-state mini indicator -----------------------------

test("extension-state mini indicator: saved -> dirty on inline edit, visible while collapsed", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `ppr_mini_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const mini = page.locator('[data-testid="extension-state-mini"]');
  await expect(mini).toBeVisible({ timeout: 15_000 });
  await expect(mini).toHaveAttribute("data-tone", "saved");
  await expect(mini).toHaveAttribute("title", "Сохранено");

  // The indicator lives in the accordion HEAD (headAccessory): it must stay
  // visible when the «Свойства» accordion is collapsed.
  const head = page.locator('.sidebarAccordion[data-section-id="properties"] > .sidebarAccordionHead');
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await expect(mini).toBeVisible();
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");

  // Inline-edit a value and commit with Enter: the draft diverges from the
  // saved state, so the indicator flips to «dirty» without a save.
  await page.getByLabel("Редактировать свойство ee_time").click();
  const valueInput = page.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(valueInput).toBeVisible({ timeout: 10_000 });
  await valueInput.fill("0.77");
  await valueInput.press("Enter");
  await expect(mini).toHaveAttribute("data-tone", "dirty", { timeout: 15_000 });
  await expect(mini).toHaveAttribute("title", "Есть несохранённые изменения");

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Adaptation: collapsible quick properties + removable default pins ----

test("quick properties: collapsible block; a default pin (ee_time) can be removed", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `ppr_quick_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const quickBlock = page.locator(".sidebarPropertiesBlock--primary").first();
  const quickToggle = quickBlock.locator(".sidebarPropertiesBlockToggle").first();
  await expect(quickToggle).toBeVisible({ timeout: 15_000 });
  await expect(quickToggle).toHaveAttribute("aria-expanded", "true");
  await expect(quickBlock.getByLabel("Редактировать свойство ee_time")).toBeVisible();

  // Collapse: rows leave the DOM; expand: they return.
  await quickToggle.click();
  await expect(quickToggle).toHaveAttribute("aria-expanded", "false");
  await expect(quickBlock.getByLabel("Редактировать свойство ee_time")).toHaveCount(0);
  await quickToggle.click();
  await expect(quickToggle).toHaveAttribute("aria-expanded", "true");
  await expect(quickBlock.getByLabel("Редактировать свойство ee_time")).toBeVisible();

  // Defaults are initial pins only: trash on ee_time unpins it — the row
  // leaves Quick but stays in the draft (surfaces in «Дополнительные BPMN»).
  await quickBlock.getByLabel("Удалить свойство ee_time").click();
  await expect(quickBlock.getByLabel("Редактировать свойство ee_time")).toHaveCount(0, { timeout: 10_000 });
  const additionalBlock = page.locator(".sidebarPropertiesBlock--wide").first();
  await expect(additionalBlock.getByLabel("Редактировать свойство ee_time")).toBeVisible({ timeout: 10_000 });

  expect(problems, problems.join("\n")).toEqual([]);
});

// --- Adaptation: floating save bar gated on unsaved changes ----------------

test("floating save bar: hidden when clean, appears on draft edit, «Отмена» reverts", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `ppr_savebar_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const footer = page.locator(".sidebarGlobalFooter");
  await expect(footer).toHaveCount(0);

  // Inline draft edit (no save): the bar appears with «Сохранить»/«Отмена».
  await page.getByLabel("Редактировать свойство ee_time").click();
  const valueInput = page.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(valueInput).toBeVisible({ timeout: 10_000 });
  await valueInput.fill("0.66");
  await valueInput.press("Enter");
  await expect(footer).toBeVisible({ timeout: 15_000 });
  await expect(footer.getByRole("button", { name: "Сохранить", exact: true })).toBeEnabled();
  await expect(footer.getByRole("button", { name: "Отмена", exact: true })).toBeEnabled();

  // «Отмена» reverts the draft and hides the bar again.
  await footer.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(footer).toHaveCount(0, { timeout: 15_000 });
  const preview = page.locator('[data-testid="live-card-preview"]');
  await expect(preview).toContainText("0.33", { timeout: 10_000 });
  await expect(preview).not.toContainText("0.66");

  expect(problems, problems.join("\n")).toEqual([]);
});
