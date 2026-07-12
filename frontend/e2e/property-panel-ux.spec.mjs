import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// Property panel UX redesign — P1 (feature/mini-indicator-from-524).
//
// T1: segmented display-mode keyboard navigation (radiogroup contract).
// T2: display mode instant preview (always/hidden/hover) — no save needed.
// T3: V2 toggle dependency — sub-control hidden when OFF, value persisted.

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
