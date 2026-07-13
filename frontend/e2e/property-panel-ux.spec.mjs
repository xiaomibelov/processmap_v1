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
// T11: quick ↔ additional two-way sync — one draft, two views (add/edit/
//      delete semantics + save/reload persistence).
// T12: V2 cards show the derived one-line display name (RU template from
//      exec.action_key + params); a manual display_name property wins.
// T13: *_ref properties autocomplete (native datalist) from the
//      process-derived ref pool; non-ref properties stay plain inputs.

const PROCESS_ID = "Process_pux";
const TASK_A = "Task_puxA";
const TASK_B = "Task_puxB";
const TASK_C = "Task_puxC";
const TASK_D = "Task_puxD";

// Canonical RobotMetaV1 body (see robotmeta/robotMeta.js) carrying an
// exec.action_key; seeded as the pm:RobotMeta text body.
function robotMetaBodyJson(actionKey) {
  return JSON.stringify({
    robot_meta_version: "v1",
    exec: {
      mode: "machine",
      executor: "manual_ui",
      action_key: actionKey,
      timeout_sec: null,
      retry: { max_attempts: 1, backoff_sec: 0 },
    },
    mat: { from_zone: null, to_zone: null, inputs: [], outputs: [] },
    qc: { critical: false, checks: [] },
  });
}

function seedXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  xmlns:pm="http://processmap.ai/schema/bpmn/1.0"
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
    <bpmn:task id="${TASK_C}" name="Task C">
      <bpmn:extensionElements>
        <pm:RobotMeta version="v1">${robotMetaBodyJson("move")}</pm:RobotMeta>
        <camunda:properties>
          <camunda:property name="object_ref" value="container_1" />
          <camunda:property name="target_ref" value="microwave_1" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:task id="${TASK_D}" name="Task D">
      <bpmn:extensionElements>
        <pm:RobotMeta version="v1">${robotMetaBodyJson("move")}</pm:RobotMeta>
        <camunda:properties>
          <camunda:property name="object_ref" value="container_1" />
          <camunda:property name="target_ref" value="microwave_1" />
          <camunda:property name="display_name" value="Ручное имя" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="${TASK_A}" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="${TASK_A}" targetRef="${TASK_B}" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="${TASK_B}" targetRef="${TASK_C}" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="${TASK_C}" targetRef="${TASK_D}" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="${TASK_D}" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Diagram">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${PROCESS_ID}">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1"><dc:Bounds x="120" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${TASK_A}" bpmnElement="${TASK_A}"><dc:Bounds x="220" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${TASK_B}" bpmnElement="${TASK_B}"><dc:Bounds x="430" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${TASK_C}" bpmnElement="${TASK_C}"><dc:Bounds x="640" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${TASK_D}" bpmnElement="${TASK_D}"><dc:Bounds x="850" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_EndEvent_1" bpmnElement="EndEvent_1"><dc:Bounds x="1060" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="156" y="170" /><di:waypoint x="220" y="170" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="340" y="170" /><di:waypoint x="430" y="170" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="550" y="170" /><di:waypoint x="640" y="170" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4"><di:waypoint x="760" y="170" /><di:waypoint x="850" y="170" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5"><di:waypoint x="970" y="170" /><di:waypoint x="1060" y="170" /></bpmndi:BPMNEdge>
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

// «Быстрые свойства» is collapsed by default on entry (layout directive):
// any interaction with quick rows must expand the block first.
async function expandQuickProperties(page) {
  const quickBlock = page.locator(".sidebarPropertiesBlock--primary").first();
  const quickToggle = quickBlock.locator(".sidebarPropertiesBlockToggle").first();
  await expect(quickToggle).toBeVisible({ timeout: 15_000 });
  if ((await quickToggle.getAttribute("aria-expanded")) !== "true") {
    await quickToggle.click();
  }
  await expect(quickToggle).toHaveAttribute("aria-expanded", "true");
  return quickBlock;
}

// To-Be block is collapsed by default on entry; expand before interacting
// with the builder.
async function expandToBeBlock(page) {
  const toBeToggle = page.locator("button.sidebarPropertiesBlockToggle", { hasText: "To-Be" }).first();
  await expect(toBeToggle).toBeVisible({ timeout: 15_000 });
  if ((await toBeToggle.getAttribute("aria-expanded")) !== "true") {
    await toBeToggle.click();
  }
  await expect(toBeToggle).toHaveAttribute("aria-expanded", "true");
  return toBeToggle;
}

// «Поля в оверлее» chips sub-block is collapsed by default on entry.
async function expandOverlayFields(page) {
  const toggle = page.locator('[data-testid="overlay-fields-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return toggle;
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
  // Collapsed by default on entry; expands on click.
  await expect(quickToggle).toHaveAttribute("aria-expanded", "false");
  await expect(quickBlock.getByLabel("Редактировать свойство ee_time")).toHaveCount(0);
  await quickToggle.click();
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

  await expandQuickProperties(page);

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
  // To-Be is collapsed by default on entry; expands on click.
  await expect(pills).toBeVisible({ timeout: 15_000 });
  await expect(builder).toHaveCount(0);
  await expandToBeBlock(page);
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
  // Chips («Поля в оверлее») are collapsed by default on entry; expand first.
  await expect(chip).toHaveCount(0);
  await expandOverlayFields(page);
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

  await expandQuickProperties(page);

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

test("T11: quick ↔ additional two-way sync — one draft, two views", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await bootDiagram(page, request, `pux_${runId}`);

  // Task B has NO seeded extension properties — the test is fixture-agnostic.
  await selectTask(page, TASK_B);
  await openPropertiesSection(page);

  const quickBlock = await expandQuickProperties(page);
  const additionalBlock = page.locator(".sidebarPropertiesBlock--secondary").first();
  // «Дополнительные BPMN-свойства» is open by default on element entry.
  await expect(additionalBlock.locator(".sidebarPropertiesBlockToggle").first())
    .toHaveAttribute("aria-expanded", "true");

  // 1. Add «test_key» via «+ Добавить быстрое свойство» and fill the value.
  await quickBlock.getByRole("button", { name: "+ Добавить быстрое свойство" }).click();
  const nameInput = quickBlock.getByLabel("Название нового быстрого свойства");
  await expect(nameInput).toBeVisible({ timeout: 10_000 });
  await nameInput.fill("test_key");
  await nameInput.press("Enter");
  const quickRow = quickBlock.getByLabel("Редактировать свойство test_key");
  await expect(quickRow).toBeVisible({ timeout: 10_000 });
  await quickRow.click();
  const quickValueInput = quickBlock.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(quickValueInput).toBeVisible({ timeout: 10_000 });
  await quickValueInput.fill("test_value");
  await quickValueInput.press("Enter");

  // 2. The row is visible in BOTH Quick and Additional (same draft).
  await expect(quickBlock.getByLabel("Редактировать свойство test_key"))
    .toContainText("test_value", { timeout: 10_000 });
  await expect(additionalBlock.getByLabel("Редактировать свойство test_key"))
    .toContainText("test_value", { timeout: 10_000 });

  // 3. Edit the value in Quick → Additional follows (one draft, two views).
  await quickBlock.getByLabel("Редактировать свойство test_key").click();
  const quickValueEdit = quickBlock.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(quickValueEdit).toBeVisible({ timeout: 10_000 });
  await quickValueEdit.fill("new_value");
  await quickValueEdit.press("Enter");
  await expect(additionalBlock.getByLabel("Редактировать свойство test_key"))
    .toContainText("new_value", { timeout: 10_000 });

  // 4. Delete in Quick → pinned row is only unpinned: gone from Quick,
  //    still present in Additional.
  await quickBlock.getByLabel("Удалить свойство test_key").click();
  await expect(quickBlock.getByLabel("Редактировать свойство test_key")).toHaveCount(0, { timeout: 10_000 });
  await expect(quickBlock.getByLabel("Добавить значение для test_key")).toHaveCount(0);
  await expect(additionalBlock.getByLabel("Редактировать свойство test_key")).toBeVisible({ timeout: 10_000 });

  // 5. Delete in Additional → hard delete: gone from Additional AND no
  //    dangling empty pinned slot in Quick.
  await additionalBlock.getByLabel("Удалить свойство test_key").click();
  await expect(additionalBlock.getByLabel("Редактировать свойство test_key")).toHaveCount(0, { timeout: 10_000 });
  await expect(quickBlock.getByLabel("Редактировать свойство test_key")).toHaveCount(0);
  await expect(quickBlock.getByLabel("Добавить значение для test_key")).toHaveCount(0);
  await expect(quickBlock.getByText("test_key", { exact: true })).toHaveCount(0);

  // 6. Persistence: add «persist_key=persist_val» in Quick, save, reload —
  //    it must reappear in BOTH lists.
  await quickBlock.getByRole("button", { name: "+ Добавить быстрое свойство" }).click();
  const persistNameInput = quickBlock.getByLabel("Название нового быстрого свойства");
  await expect(persistNameInput).toBeVisible({ timeout: 10_000 });
  await persistNameInput.fill("persist_key");
  await persistNameInput.press("Enter");
  const persistQuickRow = quickBlock.getByLabel("Редактировать свойство persist_key");
  await expect(persistQuickRow).toBeVisible({ timeout: 10_000 });
  await persistQuickRow.click();
  const persistValueInput = quickBlock.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(persistValueInput).toBeVisible({ timeout: 10_000 });
  await persistValueInput.fill("persist_val");
  await persistValueInput.press("Enter");
  await expect(quickBlock.getByLabel("Редактировать свойство persist_key"))
    .toContainText("persist_val", { timeout: 10_000 });

  await saveAll(page);
  await expect
    .poll(async () => taskBlock(await fetchBpmnXml(request, fixture), TASK_B), { timeout: 20_000 })
    .toContain('name="persist_key"');

  await page.reload();
  await waitForDiagramReady(page);
  await ensureSidebarOpen(page);
  await selectTask(page, TASK_B);
  await openPropertiesSection(page);
  const quickBlock2 = await expandQuickProperties(page);
  const additionalBlock2 = page.locator(".sidebarPropertiesBlock--secondary").first();
  await expect(quickBlock2.getByLabel("Редактировать свойство persist_key"))
    .toContainText("persist_val", { timeout: 15_000 });
  await expect(additionalBlock2.getByLabel("Редактировать свойство persist_key"))
    .toContainText("persist_val", { timeout: 15_000 });

  // 7. Cleanup-agnostic: delete «persist_key» in Additional (still pinned
  //    after reload) → unpin + hard delete; auto-save flushes; the property
  //    disappears from both views and from the saved XML.
  await additionalBlock2.getByLabel("Удалить свойство persist_key").click();
  await expect(additionalBlock2.getByLabel("Редактировать свойство persist_key"))
    .toHaveCount(0, { timeout: 10_000 });
  await expect(quickBlock2.getByLabel("Редактировать свойство persist_key")).toHaveCount(0);
  await expect(quickBlock2.getByLabel("Добавить значение для persist_key")).toHaveCount(0);
  await expect(quickBlock2.getByText("persist_key", { exact: true })).toHaveCount(0);
  // Full XML check: with its only property gone, Task B may serialize back
  // to a self-closing tag (no </bpmn:task> block to match).
  await expect
    .poll(async () => fetchBpmnXml(request, fixture), { timeout: 20_000 })
    .not.toContain("persist_key");

  expect(problems, problems.join("\n")).toEqual([]);
});

test("T12: V2 card shows derived display name; manual display_name wins", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);

  // V2 overlays ON (seeded fixture already carries pm:RobotMeta +
  // camunda:properties for Tasks C/D — no UI editing needed).
  await page.locator('[data-testid="v2-toggle"]').click();

  // Task C: exec.action_key="move" + object_ref/target_ref → RU template.
  await selectTask(page, TASK_C);
  const v2HostC = page.locator(`.fpc-overlay-v2-host[data-fpc-element-id="${TASK_C}"]`);
  await expect(v2HostC).toBeVisible({ timeout: 15_000 });
  await expect(v2HostC.locator(".fpc-overlay-v2-title"))
    .toHaveText("Перенести container_1 в microwave_1", { timeout: 15_000 });
  // Idle/compact mode: the raw rows list is replaced by the one-line name.
  await expect(v2HostC.locator(".fpc-overlay-v2-list")).toBeHidden();

  // Task D: same operation + params, but a manual display_name property
  // always wins and is shown as-is.
  await selectTask(page, TASK_D);
  const v2HostD = page.locator(`.fpc-overlay-v2-host[data-fpc-element-id="${TASK_D}"]`);
  await expect(v2HostD).toBeVisible({ timeout: 15_000 });
  await expect(v2HostD.locator(".fpc-overlay-v2-title"))
    .toHaveText("Ручное имя", { timeout: 15_000 });
  await expect(v2HostD.locator(".fpc-overlay-v2-list")).toBeHidden();

  expect(problems, problems.join("\n")).toEqual([]);
});

test("T13: *_ref properties autocomplete from the process-derived ref pool", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);

  // Task B has NO seeded extension properties; the ref pool comes from
  // Task C/D (object_ref=container_1, target_ref=microwave_1), derived
  // server-side into camunda_extensions_by_element_id. Backend reference
  // options are intentionally NOT asserted (stage may return anything).
  await selectTask(page, TASK_B);
  await openPropertiesSection(page);
  const additionalBlock = page.locator(".sidebarPropertiesBlock--secondary").first();
  await expect(additionalBlock.locator(".sidebarPropertiesBlockToggle").first())
    .toHaveAttribute("aria-expanded", "true");

  // 1. Add a ref-named property → its value input gains a datalist with
  //    the process-derived refs.
  await additionalBlock.getByRole("button", { name: "+ Добавить BPMN-свойство" }).click();
  await additionalBlock.getByLabel("Редактировать свойство новое").click();
  const refNameInput = additionalBlock.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Название"]');
  await expect(refNameInput).toBeVisible({ timeout: 10_000 });
  await refNameInput.fill("object_ref");
  const refValueInput = additionalBlock.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(refValueInput).toHaveAttribute("list", /^prop_ref_/, { timeout: 10_000 });
  const refListId = await refValueInput.getAttribute("list");
  const refDatalist = page.locator(`datalist[id="${refListId}"]`);
  await expect(refDatalist.locator('option[value="container_1"]')).toHaveCount(1);
  await expect(refDatalist.locator('option[value="microwave_1"]')).toHaveCount(1);

  // Commit the ref row (Enter) so the next added row is a fresh empty one.
  await refValueInput.press("Enter");
  await expect(additionalBlock.getByLabel("Редактировать свойство object_ref"))
    .toBeVisible({ timeout: 10_000 });

  // 2. A non-ref property gets NO datalist — stays a plain text input.
  await additionalBlock.getByRole("button", { name: "+ Добавить BPMN-свойство" }).click();
  await additionalBlock.getByLabel("Редактировать свойство новое").click();
  const plainNameInput = additionalBlock.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Название"]');
  await expect(plainNameInput).toBeVisible({ timeout: 10_000 });
  await plainNameInput.fill("plain_key");
  const plainValueInput = additionalBlock.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(plainValueInput).toBeVisible({ timeout: 10_000 });
  expect(await plainValueInput.getAttribute("list")).toBeNull();
  await plainValueInput.press("Enter");

  expect(problems, problems.join("\n")).toEqual([]);
});

test("T14: «Экспорт ZIP (YAML + BPMN)» downloads the session export zip", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `pux_${runId}`);

  const exportBtn = page.getByTestId("bpmn-export-zip-button");
  await expect(exportBtn).toBeVisible({ timeout: 15_000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    exportBtn.click(),
  ]);
  const filename = download.suggestedFilename();
  expect(filename).toMatch(/\.zip$/);

  // Zip content sanity: process.yml + a .bpmn file must be inside.
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmpFile = path.join(os.tmpdir(), `pux_export_${runId}.zip`);
  await download.saveAs(tmpFile);
  const listing = execFileSync("python3", ["-c",
    `import zipfile,sys; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))`, tmpFile],
  ).toString();
  expect(listing).toContain("process.yml");
  expect(listing).toMatch(/\.bpmn/);
  fs.unlinkSync(tmpFile);

  expect(problems, problems.join("\n")).toEqual([]);
});
