import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken, withAuthHeaders } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// Full property round-trip against the post C1..C9 inline DOM (origin/main
// a902fb12). Selectors mirror the proven bpmn-property-pipeline-smoke /
// bpmn-property-delete specs (inline rows, global footer Save). No property
// CRUD logic is changed here — only selectors + inline interactions.

function seedXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" name="E2E Process" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Task baseline">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="170" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="290" y="148" width="170" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="560" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="206" y="188" />
        <di:waypoint x="290" y="188" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="460" y="188" />
        <di:waypoint x="560" y="188" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openNodeProperties(page) {
  const discussionsBtn = page.getByRole("button", { name: "Обсуждения" });
  await expect(discussionsBtn).toBeVisible();
  await discussionsBtn.click();

  const nodeSectionBtn = page.locator("[data-testid='left-sidebar-handle'] button[aria-label='Выбранный узел']");
  await expect(nodeSectionBtn).toBeVisible();
  await nodeSectionBtn.click();

  const propertiesAccordion = page.locator(".sidebarAccordionHead").filter({ hasText: /^Свойства$/ }).first();
  await expect(propertiesAccordion).toBeVisible();
  await propertiesAccordion.click();

  const sectionToggle = page.locator("button.sidebarPropertiesBlockToggle", { hasText: "Дополнительные BPMN-свойства" });
  await expect(sectionToggle).toBeVisible();
  if ((await sectionToggle.getAttribute("aria-expanded")) !== "true") {
    await sectionToggle.click();
  }
}

async function getServerBpmnXml(request, sessionId, token) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn?include_overlay=0`, {
    headers: withAuthHeaders(token),
  });
  if (!res.ok()) return "";
  return res.text();
}

async function waitForSaveComplete(saveBtn, { timeout = 15000 } = {}) {
  await expect
    .poll(
      async () => {
        const [enabled, text] = await Promise.all([saveBtn.isEnabled(), saveBtn.innerText()]);
        return { enabled, text: text.trim() };
      },
      { timeout },
    )
    .toEqual({ enabled: false, text: "Сохранить всё" });
}

// Row whose read-mode name (.sidebarSchemaPropertyHuman) equals `name` exactly.
function rowByName(page, rows, name) {
  return rows.filter({
    has: page.locator(".sidebarSchemaPropertyHuman", { hasText: new RegExp(`^${escapeRe(name)}$`) }),
  });
}

// Add an additional property inline: click "+", then edit the new (last) row.
async function addProperty(rows, addBtn, name, value) {
  const before = await rows.count();
  await addBtn.click();
  await expect(rows).toHaveCount(before + 1);
  const row = rows.last();
  await row.click();
  const inputs = row.locator("input.sidebarInput");
  await expect(inputs).toHaveCount(2);
  await inputs.nth(0).fill(name);
  await inputs.nth(1).fill(value);
  await inputs.nth(1).press("Enter");
  await expect(row.locator(".sidebarSchemaPropertyHuman")).toHaveText(name);
  await expect(row.locator(".sidebarSchemaPropertyValueText")).toHaveText(value);
}

test("property round-trip: add 4 / reload / edit A=10 / delete A (now+5s+reload) / rapid add 3", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers, seedXml());

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });

  await setUiToken(page, auth.accessToken, {
    activeOrgId: auth.activeOrgId,
    refreshToken: auth.refreshToken,
    refreshCookie: auth.refreshCookie,
  });

  if (auth.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }

  const readXml = () => getServerBpmnXml(request, fixture.sessionId, auth.accessToken);

  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page);

  await page.locator('g[data-element-id="Task_1"]').first().click();
  await openNodeProperties(page);

  const rows = page.locator(".sidebarBpmnPropertyItem");
  await expect(rows).toHaveCount(0);

  const saveBtn = page.locator(".sidebarGlobalFooter").getByRole("button", { name: "Сохранить всё" });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeDisabled();

  const addBtn = page.getByRole("button", { name: /Добавить BPMN-свойство/ });
  await expect(addBtn).toBeVisible();

  // 1) Add A, B, C, D inline, then one global Save.
  for (const [name, value] of [["A", "1"], ["B", "2"], ["C", "3"], ["D", "4"]]) {
    await addProperty(rows, addBtn, name, value);
  }
  await expect(rows).toHaveCount(4);
  await expect(saveBtn).toBeEnabled();

  await saveBtn.click();
  await waitForSaveComplete(saveBtn);
  await expect(page.getByText("Отсутствует BPMN XML")).toHaveCount(0);

  let xml = await readXml();
  for (const [name, value] of [["A", "1"], ["B", "2"], ["C", "3"], ["D", "4"]]) {
    expect(xml).toContain(`name="${name}"`);
    expect(xml).toContain(`value="${value}"`);
  }

  // Reload → 4 properties persist.
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page);
  await page.locator('g[data-element-id="Task_1"]').first().click();
  await openNodeProperties(page);
  await expect.poll(async () => rows.count()).toBe(4);
  for (const name of ["A", "B", "C", "D"]) {
    await expect(rowByName(page, rows, name)).toHaveCount(1);
  }

  // 2) Edit A → value 10, global Save, reload → A=10, others unchanged.
  const aRow = rowByName(page, rows, "A");
  await aRow.click();
  const aInputs = aRow.locator("input.sidebarInput");
  await expect(aInputs).toHaveCount(2);
  await aInputs.nth(1).fill("10");
  await aInputs.nth(1).press("Enter");
  await expect(aRow.locator(".sidebarSchemaPropertyValueText")).toHaveText("10");
  await expect(saveBtn).toBeEnabled();

  await saveBtn.click();
  await waitForSaveComplete(saveBtn);
  await expect(page.getByText("Отсутствует BPMN XML")).toHaveCount(0);

  xml = await readXml();
  expect(xml).toContain('name="A"');
  expect(xml).toContain('value="10"');
  expect(xml).not.toContain('value="1"');
  for (const [name, value] of [["B", "2"], ["C", "3"], ["D", "4"]]) {
    expect(xml).toContain(`name="${name}"`);
    expect(xml).toContain(`value="${value}"`);
  }

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page);
  await page.locator('g[data-element-id="Task_1"]').first().click();
  await openNodeProperties(page);
  await expect(rowByName(page, rows, "A")).toHaveCount(1);
  await expect(rowByName(page, rows, "A").locator(".sidebarSchemaPropertyValueText")).toHaveText("10");

  // 3) Delete A. Deletion auto-flushes, so the global Save has nothing to do.
  await rowByName(page, rows, "A").locator(".sidebarPropertyActionBtn--danger").first().click();
  await expect(rowByName(page, rows, "A")).toHaveCount(0);
  await expect(saveBtn).toBeDisabled();
  await expect.poll(async () => (await readXml()).includes('name="A"')).toBe(false);

  // Still absent after 5 seconds.
  await page.waitForTimeout(5000);
  expect(await readXml()).not.toContain('name="A"');
  expect(await readXml()).toContain('name="B"');

  // Still absent after a hard reload; B remains.
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page);
  await page.locator('g[data-element-id="Task_1"]').first().click();
  await openNodeProperties(page);
  await expect(rowByName(page, rows, "A")).toHaveCount(0);
  await expect(rowByName(page, rows, "B")).toHaveCount(1);
  xml = await readXml();
  expect(xml).not.toContain('name="A"');
  expect(xml).toContain('name="B"');

  // 4) Rapid add X, Y, Z (no save between), then one global Save.
  for (const [name, value] of [["X", "7"], ["Y", "8"], ["Z", "9"]]) {
    await addProperty(rows, addBtn, name, value);
  }
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await waitForSaveComplete(saveBtn);
  await expect(page.getByText("Отсутствует BPMN XML")).toHaveCount(0);

  xml = await readXml();
  for (const [name, value] of [["X", "7"], ["Y", "8"], ["Z", "9"]]) {
    expect(xml).toContain(`name="${name}"`);
    expect(xml).toContain(`value="${value}"`);
  }
  // And the previously kept properties are still present.
  expect(xml).toContain('name="B"');
  expect(xml).toContain('name="C"');
  expect(xml).toContain('name="D"');
});
