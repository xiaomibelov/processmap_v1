import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// Property panel UX redesign — P1 (feature/mini-indicator-from-524).
//
// T1: segmented display-mode keyboard navigation (radiogroup contract).
// T2: display mode instant preview (always/hidden/hover) — no save needed.
// T3: V2 toggle dependency — sub-control hidden when OFF, value persisted.
// T4: V2→display-mode coupling (B3): ON forces «Скрыто» + locks; OFF restores.
// T5: extension-state mini indicator lives in the accordion head (B1).
// T6: quick properties collapsible + default pin removable (B4).
// T7: floating save bar gated on unsaved changes (B6).
// T8: To-Be toggle → pool → '+' → draft → save → XML.
// T9: chip toggle hides the field from legacy + V2 cards (data untouched).
// T10: live preview mirrors the draft (no save).

const PROCESS_ID = "Process_pux";
const TASK_A = "Task_puxA";
const TASK_B = "Task_puxB";

function seedXml() {
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

// Pre-existing on main (2026-07): dev-mode React warning loop in ProcessStage.
// Filter ONLY this exact warning; anything else fails the test.
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

async function bootDiagram(page, request, runId) {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers, seedXml());
  await setUiToken(page, auth.accessToken);
  const orgId = String(fixture.orgId || auth.activeOrgId || "").trim();
  await page.addInitScript((org) => {
    if (org) window.localStorage.setItem("fpc_active_org_id", org);
  }, orgId);
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
      // bpmn-js SelectionBehavior gates on isPrimaryButton(originalEvent).
      eventBus.fire("element.click", { element, originalEvent: { button: 0 } });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, taskId);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  await page.waitForTimeout(400);
}

function legacyCards(page) {
  return page.locator(".fpcPropertyOverlay");
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

test("T1: segmented display mode — keyboard navigation (radiogroup)", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);
  await openPropertiesSection(page);

  const group = page.locator('[data-testid="display-mode"]');
  await expect(group).toHaveAttribute("role", "radiogroup");
  const hover = page.locator('[data-testid="display-mode-segment-hover"]');
  const always = page.locator('[data-testid="display-mode-segment-always"]');
  const hidden = page.locator('[data-testid="display-mode-segment-hidden"]');
  await expect(hover).toBeVisible({ timeout: 15_000 });

  // Deterministic start: select «При наведении».
  await hover.click();
  await expect(hover).toHaveAttribute("aria-checked", "true");
  await expect(hover).toHaveAttribute("role", "radio");

  // ArrowRight moves selection with focus-follows-selection.
  await hover.press("ArrowRight");
  await expect(always).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
  await expect(hover).toHaveAttribute("aria-checked", "false");

  // ArrowRight again + wrap-around via ArrowLeft from the first segment.
  await always.press("ArrowRight");
  await expect(hidden).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
  await hidden.press("ArrowRight");
  await expect(hover).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });

  // Home/End jump to first/last.
  await hover.press("End");
  await expect(hidden).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
  await hidden.press("Home");
  await expect(hover).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });

  expect(problems, problems.join("\n")).toEqual([]);
});

test("T2: display mode — instant preview (always/hidden/hover), no save", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);
  await openPropertiesSection(page);

  const always = page.locator('[data-testid="display-mode-segment-always"]');
  const hidden = page.locator('[data-testid="display-mode-segment-hidden"]');
  const hover = page.locator('[data-testid="display-mode-segment-hover"]');
  await expect(always).toBeVisible({ timeout: 15_000 });

  // «Всегда» — cards over tasks without any selection, no reload/save.
  await always.click();
  await expect(always).toHaveAttribute("aria-checked", "true");
  await expect(legacyCards(page).first()).toBeVisible({ timeout: 15_000 });

  // «Скрыто» — zero cards.
  await hidden.click();
  await expect(legacyCards(page)).toHaveCount(0, { timeout: 10_000 });

  // «При наведении» — nothing until a task is selected, then the card appears.
  await hover.click();
  await expect(legacyCards(page)).toHaveCount(0, { timeout: 10_000 });
  await selectTask(page, TASK_A);
  await expect(legacyCards(page).first()).toBeVisible({ timeout: 15_000 });

  expect(problems, problems.join("\n")).toEqual([]);
});

test("T3: V2 toggle dependency — sub-control hidden when OFF, value persisted", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);
  await openPropertiesSection(page);

  const toggle = page.locator('[data-testid="v2-toggle"]');
  const sub = page.locator('[data-testid="v2-sub-control"]');
  const expanded = page.locator('[data-testid="v2-mode-segment-expanded"]');
  await expect(toggle).toBeVisible({ timeout: 15_000 });

  // OFF: sub-control collapsed (aria-hidden) and inner control disabled.
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(sub).toHaveAttribute("aria-hidden", "true");
  await expect(expanded).toBeDisabled();

  // ON: sub-control opens, segments become available.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(sub).not.toHaveAttribute("aria-hidden", "true", { timeout: 5_000 });
  await expect(expanded).toBeEnabled({ timeout: 5_000 });

  // Select «Раскрыто», toggle OFF (sub hidden) then ON again — value persisted.
  await expanded.click();
  await expect(expanded).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(sub).toHaveAttribute("aria-hidden", "true", { timeout: 5_000 });
  await toggle.click();
  await expect(expanded).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });

  expect(problems, problems.join("\n")).toEqual([]);
});

test("T4: V2→display-mode coupling — ON forces «Скрыто» + locks; OFF restores", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);
  await openPropertiesSection(page);

  const toggle = page.locator('[data-testid="v2-toggle"]');
  const hover = page.locator('[data-testid="display-mode-segment-hover"]');
  const always = page.locator('[data-testid="display-mode-segment-always"]');
  const hidden = page.locator('[data-testid="display-mode-segment-hidden"]');
  const hint = page.locator('[data-testid="display-mode-hint"]');
  await expect(toggle).toBeVisible({ timeout: 15_000 });

  // Start from a deterministic non-hidden mode.
  await always.click();
  await expect(always).toHaveAttribute("aria-checked", "true");

  // V2 ON: display mode forced to «Скрыто», segments locked, hint explains why.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(hidden).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
  await expect(always).toHaveAttribute("aria-checked", "false");
  await expect(hover).toBeDisabled();
  await expect(always).toBeDisabled();
  await expect(hidden).toBeDisabled();
  await expect(hint).toContainText("Скрыто автоматически: включены V2-оверлеи");

  // V2 OFF: the previous mode («Всегда») is restored and segments unlock.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(always).toHaveAttribute("aria-checked", "true", { timeout: 5_000 });
  await expect(always).toBeEnabled();

  expect(problems, problems.join("\n")).toEqual([]);
});

test("T5: extension-state mini indicator lives in the accordion head (visible while collapsed)", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const mini = page.locator('[data-testid="extension-state-mini"]');
  await expect(mini).toBeVisible({ timeout: 15_000 });
  await expect(mini).toHaveAttribute("data-tone", "saved");

  // The indicator lives in the accordion HEAD (headAccessory): it must stay
  // visible when the «Свойства» accordion is collapsed.
  const head = page.locator('.sidebarAccordion[data-section-id="properties"] > .sidebarAccordionHead');
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await expect(mini).toBeVisible();
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");

  expect(problems, problems.join("\n")).toEqual([]);
});

test("T6: quick properties collapsible; a default pin (ee_time) can be removed", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);

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

test("T7: floating save bar — hidden when clean, appears on edit, «Отмена» reverts", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);

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

test("T8: To-Be — toggle → Pool on another task → '+' → draft row → save → XML", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await bootDiagram(page, request, `pux_${runId}`);

  // Task A: ee_time starts as «Added» (ad-hoc); toggle it into the To-Be set.
  await selectTask(page, TASK_A);
  await openPropertiesSection(page);
  const builder = page.locator('[data-testid="to-be-builder"]');
  const pills = page.locator(".toBePills").first();
  await expect(builder).toBeVisible({ timeout: 15_000 });
  await expect(pills).toContainText("0 in To-Be / 0 skipped");
  await page.locator('[data-testid="to-be-toggle-ee_time"]').click();
  await expect(pills).toContainText("1 in To-Be / 0 skipped");

  // Task B has no properties: ee_time surfaces in the Pool as «Not filled».
  await selectTask(page, TASK_B);
  await expect(pills).toContainText("0 in To-Be / 1 skipped", { timeout: 15_000 });
  await expect(builder.locator('[data-testid="to-be-add-ee_time"]')).toBeVisible();

  // «+» adds the field to the draft, pills recount.
  await builder.locator('[data-testid="to-be-add-ee_time"]').click();
  await expect(page.getByLabel("Редактировать свойство ee_time")).toBeVisible({ timeout: 10_000 });
  await expect(pills).toContainText("1 in To-Be / 0 skipped");

  // Global save persists the property into the task's extensionElements.
  await saveAll(page);
  await expect
    .poll(async () => taskBlock(await fetchBpmnXml(request, fixture), TASK_B), { timeout: 20_000 })
    .toContain('name="ee_time"');

  expect(problems, problems.join("\n")).toEqual([]);
});

test("T9: chip toggle hides the field from legacy and V2 cards (data untouched)", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  // «Всегда» — legacy cards over all tasks.
  await page.locator('[data-testid="display-mode-segment-always"]').click();
  const card = legacyCards(page).first();
  await expect(card).toContainText("ee_time", { timeout: 15_000 });
  await expect(card).toContainText("ingredient_value");

  const chip = page.locator('[data-testid="overlay-field-chip-ee_time"]');
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(card).not.toContainText("ee_time", { timeout: 15_000 });
  await expect(card).toContainText("ingredient_value");

  // Same filter applies to V2 cards (V2 ON forces legacy «Скрыто» — B3).
  await page.locator('[data-testid="v2-toggle"]').click();
  const v2HostA = page.locator(`.fpc-overlay-v2-host[data-fpc-element-id="${TASK_A}"]`);
  await expect(v2HostA).toBeVisible({ timeout: 15_000 });
  await expect(v2HostA).not.toContainText("ee_time");
  await expect(v2HostA).toContainText("ingredient_value");

  // Toggle back: the field returns (nothing was deleted).
  await chip.click();
  await expect(v2HostA).toContainText("ee_time", { timeout: 15_000 });

  expect(problems, problems.join("\n")).toEqual([]);
});

test("T10: live preview mirrors the draft — seeded values and inline edits (no save)", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);

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
