import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// Extension-state mini indicator (feature/mini-indicator-from-524).
//
// Covers the Tier-1a cherry-pick from PR #524: the compact ✓/✎ indicator at
// the «Свойства» accordion head (visible even while collapsed). Verifies
// reactivity (saved -> dirty on inline edit WITHOUT save) and the save
// round-trip (dirty -> saved after «Сохранить», value persisted into the
// BPMN XML).

const PROCESS_ID = "Process_miniind";
const TASK_A = "Task_miniA";

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
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="${TASK_A}" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="${TASK_A}" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Diagram">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${PROCESS_ID}">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_1" bpmnElement="StartEvent_1"><dc:Bounds x="120" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_${TASK_A}" bpmnElement="${TASK_A}"><dc:Bounds x="220" y="130" width="120" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="_BPMNShape_EndEvent_1" bpmnElement="EndEvent_1"><dc:Bounds x="430" y="152" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="156" y="170" /><di:waypoint x="220" y="170" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="340" y="170" /><di:waypoint x="430" y="170" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

// Pre-existing on main (2026-07): dev-mode React warning loop in ProcessStage
// (useBpmnSync fresh-object effect ping-pong). Filter ONLY this exact warning;
// any other console.error/pageerror still fails the test.
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

async function fetchBpmnXml(request, fixture) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn`, {
    headers: fixture.auth.headers,
  });
  const xml = await res.text();
  expect(res.ok(), `GET bpmn: ${xml.slice(0, 300)}`).toBeTruthy();
  return xml;
}

// «Быстрые свойства» is collapsed by default on entry (layout directive):
// expand it before interacting with quick rows.
async function expandQuickProperties(page) {
  const quickBlock = page.locator(".sidebarPropertiesBlock--primary").first();
  const quickToggle = quickBlock.locator(".sidebarPropertiesBlockToggle").first();
  await expect(quickToggle).toBeVisible({ timeout: 15_000 });
  if ((await quickToggle.getAttribute("aria-expanded")) !== "true") {
    await quickToggle.click();
  }
  await expect(quickToggle).toHaveAttribute("aria-expanded", "true");
}

test("mini indicator: saved -> dirty on inline edit (no save)", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `mini_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const mini = page.locator('[data-testid="extension-state-mini"]');
  await expect(mini).toBeVisible({ timeout: 15_000 });
  await expect(mini).toHaveAttribute("data-tone", "saved");
  await expect(mini).toHaveAttribute("title", "Сохранено");

  await expandQuickProperties(page);

  // Inline-edit a value and commit with Enter: the draft diverges from the
  // saved state, so the indicator flips to «dirty» WITHOUT a save.
  await page.getByLabel("Редактировать свойство ee_time").click();
  const valueInput = page.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await expect(valueInput).toBeVisible({ timeout: 10_000 });
  await valueInput.fill("0.77");
  await valueInput.press("Enter");
  await expect(mini).toHaveAttribute("data-tone", "dirty", { timeout: 15_000 });
  await expect(mini).toHaveAttribute("title", "Есть несохранённые изменения");

  expect(problems, problems.join("\n")).toEqual([]);
});

test("mini indicator: dirty -> saved after «Сохранить» (XML persisted)", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await bootDiagram(page, request, `mini_${runId}`);

  await selectTask(page, TASK_A);
  await openPropertiesSection(page);

  const mini = page.locator('[data-testid="extension-state-mini"]');
  await expect(mini).toHaveAttribute("data-tone", "saved", { timeout: 15_000 });

  await expandQuickProperties(page);

  await page.getByLabel("Редактировать свойство ee_time").click();
  const valueInput = page.locator('.sidebarSchemaPropertyRow.isEditing input[placeholder="Значение"]');
  await valueInput.fill("0.91");
  await valueInput.press("Enter");
  await expect(mini).toHaveAttribute("data-tone", "dirty", { timeout: 15_000 });

  const saveAll = page.locator(".sidebarGlobalFooter").getByRole("button", { name: "Сохранить", exact: true });
  await expect(saveAll).toBeEnabled({ timeout: 10_000 });
  await saveAll.click();
  await expect(mini).toHaveAttribute("data-tone", "saved", { timeout: 20_000 });
  await expect(mini).toHaveAttribute("title", "Сохранено");

  const xml = await fetchBpmnXml(request, fixture);
  expect(xml).toContain('name="ee_time" value="0.91"');

  expect(problems, problems.join("\n")).toEqual([]);
});
