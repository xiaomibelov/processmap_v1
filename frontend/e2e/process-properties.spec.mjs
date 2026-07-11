import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, seedXml } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// Process-level properties (Camunda Modeler parity).
//
// Clicking empty canvas selects the root bpmn:Process element; the sidebar
// then shows "Процесс: <name>" with the regular — id-generic — camunda
// property editor. Properties persist into <bpmn:process> extensionElements
// via the standard save pipeline and survive reloads. Flow-node-only sidebar
// sections stay hidden for the process, and no overlay card is rendered for
// the geometry-less root. Task-level properties must keep working (regression).

const PROCESS_ID = "Process_1";
const TASK_ID = "Task_1";
const PROCESS_NAME = "E2E ProcProps";

function seedXmlWithProcessProperty() {
  return seedXml({ processName: PROCESS_NAME, taskName: "Task baseline" }).replace(
    "<bpmn:process id=\"Process_1\" name=\"E2E ProcProps\" isExecutable=\"false\">",
    `<bpmn:process id="Process_1" name="E2E ProcProps" isExecutable="false">
    <bpmn:extensionElements>
      <camunda:properties xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <camunda:property name="proc_seeded" value="seeded-1" />
      </camunda:properties>
    </bpmn:extensionElements>`,
  );
}

function collectConsoleProblems(page) {
  const problems = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${String(err?.message || err)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console.error: ${msg.text()}`);
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

// Fire the same event pipeline as a real click on empty canvas: bpmn-js
// SelectionBehavior maps a root click to an empty selection, which the stage
// wires to process-root selection.
async function clickEmptyCanvas(page) {
  const result = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const eventBus = modeler.get("eventBus");
      const root = modeler.get("canvas").getRootElement();
      // originalEvent.button===0 is required: bpmn-js SelectionBehavior
      // ignores element.click events that are not primary-button clicks.
      eventBus.fire("element.click", { element: root, originalEvent: { button: 0 } });
      return { ok: true, rootId: String(root?.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return result.rootId;
}

async function selectTask(page, taskId = TASK_ID) {
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

async function bootDiagram(page, request, runId, xml) {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers, xml);
  await setUiToken(page, auth.accessToken);
  const orgId = String(fixture.orgId || auth.activeOrgId || "").trim();
  await page.addInitScript((value) => {
    if (value) window.localStorage.setItem("fpc_active_org_id", value);
  }, orgId);
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await settleOrgChooser(page);
  await waitForDiagramReady(page);
  await ensureSidebarOpen(page);
  return { ...fixture, auth };
}

async function fetchBpmnXml(request, fixture) {
  // GET /api/sessions/{id}/bpmn returns the raw BPMN document (application/xml).
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn`, {
    headers: fixture.auth.headers,
  });
  const xml = await res.text();
  expect(res.ok(), `GET bpmn: ${xml.slice(0, 300)}`).toBeTruthy();
  expect(xml).toContain("bpmn:definitions");
  return xml;
}

function processBlock(xml) {
  const match = String(xml).match(/<bpmn:process\b[^>]*>([\s\S]*?)<\/bpmn:process>/);
  expect(match, "bpmn:process block must exist in saved XML").toBeTruthy();
  return match[1];
}

async function saveAll(page) {
  const putWait = page.waitForResponse(
    (res) => res.url().includes("/bpmn") && res.request().method() === "PUT",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Сохранить всё" }).click();
  const putRes = await putWait;
  expect(putRes.ok(), `PUT bpmn status ${putRes.status()}`).toBeTruthy();
}

async function selectProcessAndOpenProperties(page) {
  const rootId = await clickEmptyCanvas(page);
  expect(rootId).toBe(PROCESS_ID);
  const card = page.locator(".selectedElementCard");
  await expect(card).toContainText(`Процесс: ${PROCESS_NAME}`, { timeout: 15_000 });
  await openPropertiesSection(page);
  await expect(page.locator('[data-testid="camunda-properties-group"]')).toBeVisible({ timeout: 15_000 });
}

// Quick pinned slot (ee_time / ingredient_value): fill the empty slot value
// and commit — creates a draft row that persists on the global save.
async function fillQuickProperty(page, name, value) {
  const input = page.getByLabel(`Добавить значение для ${name}`);
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(value);
  await input.press("Enter");
  await page.waitForTimeout(200);
}

test("empty canvas click selects the process and shows its properties", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `procprops_sel_${runId}`, seedXml({ processName: PROCESS_NAME }));

  await selectProcessAndOpenProperties(page);

  // Container-level selection decor (the root wraps every shape, so no
  // per-shape marker is used).
  await expect(page.locator(".djs-container.fpcProcessSelected")).toHaveCount(1);

  // Flow-node-only sections stay hidden for a process selection.
  for (const sectionId of ["paths", "time", "robotmeta", "execution", "notes", "ai", "advanced"]) {
    await expect(page.locator(`.sidebarAccordion[data-section-id="${sectionId}"]`)).toHaveCount(0);
  }

  // No overlay card for the geometry-less process root.
  await expect(page.locator(".fpcPropertyOverlay")).toHaveCount(0);
  await expect(page.locator(".fpc-overlay-v2-host")).toHaveCount(0);

  expect(problems, problems.join("\n")).toEqual([]);
});

test("process property is saved into the bpmn:process extensionElements", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await bootDiagram(page, request, `procprops_add_${runId}`, seedXml({ processName: PROCESS_NAME }));

  await selectProcessAndOpenProperties(page);
  await fillQuickProperty(page, "ee_time", "72");
  await saveAll(page);

  await expect
    .poll(async () => processBlock(await fetchBpmnXml(request, fixture)), { timeout: 20_000 })
    .toContain('name="ee_time" value="72"');

  expect(problems, problems.join("\n")).toEqual([]);
});

test("process properties survive a page reload", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await bootDiagram(page, request, `procprops_reload_${runId}`, seedXmlWithProcessProperty());

  await selectProcessAndOpenProperties(page);
  // The seeded process-level property is restored into the sidebar editor.
  await expect(page.getByLabel("Редактировать свойство proc_seeded")).toContainText("seeded-1", { timeout: 15_000 });

  await page.reload();
  await settleOrgChooser(page);
  await waitForDiagramReady(page);
  await ensureSidebarOpen(page);

  await selectProcessAndOpenProperties(page);
  await expect(page.getByLabel("Редактировать свойство proc_seeded")).toContainText("seeded-1", { timeout: 15_000 });

  expect(problems, problems.join("\n")).toEqual([]);
});

test("process property edit and delete are persisted", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await bootDiagram(page, request, `procprops_edit_${runId}`, seedXmlWithProcessProperty());

  await selectProcessAndOpenProperties(page);

  // Edit the seeded value.
  await page.getByLabel("Редактировать свойство proc_seeded").click();
  const valueInput = page.locator(".sidebarBpmnPropertyItem.isEditing").getByPlaceholder("Значение");
  await expect(valueInput).toBeVisible({ timeout: 10_000 });
  await valueInput.fill("seeded-2");
  await valueInput.press("Enter");
  await page.waitForTimeout(200);
  await saveAll(page);
  await expect
    .poll(async () => processBlock(await fetchBpmnXml(request, fixture)), { timeout: 20_000 })
    .toContain('name="proc_seeded" value="seeded-2"');

  // Reload so the delete step starts from a settled server state (the
  // post-save background session refresh is eventually consistent).
  await page.reload();
  await settleOrgChooser(page);
  await waitForDiagramReady(page);
  await ensureSidebarOpen(page);
  await selectProcessAndOpenProperties(page);
  await expect(page.getByLabel("Редактировать свойство proc_seeded")).toContainText("seeded-2", { timeout: 15_000 });

  // Delete the property. Deleting a row in the additional-properties section
  // auto-saves the extension state, so await the PUT it triggers itself.
  const deletePutWait = page.waitForResponse(
    (res) => res.url().includes("/bpmn") && res.request().method() === "PUT",
    { timeout: 30_000 },
  );
  await page.getByLabel("Удалить свойство proc_seeded").click();
  const deletePut = await deletePutWait;
  expect(deletePut.ok(), `PUT bpmn status ${deletePut.status()}`).toBeTruthy();
  await expect
    .poll(async () => processBlock(await fetchBpmnXml(request, fixture)), { timeout: 20_000 })
    .not.toContain("proc_seeded");

  expect(problems, problems.join("\n")).toEqual([]);
});

test("task properties still work and Escape clears the selection", async ({ page, request }) => {
  const problems = collectConsoleProblems(page);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await bootDiagram(page, request, `procprops_task_${runId}`, seedXml({ processName: PROCESS_NAME }));

  // Regression: flow-node selection keeps its sections and its own save path.
  await selectTask(page);
  const card = page.locator(".selectedElementCard");
  await expect(card).toContainText("Task baseline", { timeout: 15_000 });
  await expect(card).not.toContainText("Процесс:");
  await expect(page.locator('.sidebarAccordion[data-section-id="paths"]')).toHaveCount(1);
  await openPropertiesSection(page);
  await fillQuickProperty(page, "ee_time", "5");
  await saveAll(page);
  await expect
    .poll(async () => {
      const xml = await fetchBpmnXml(request, fixture);
      const match = String(xml).match(/<bpmn:userTask\b[^>]*id="Task_1"[^>]*>([\s\S]*?)<\/bpmn:userTask>/);
      return match ? match[1] : "NO_TASK_BLOCK";
    }, { timeout: 20_000 })
    .toContain('name="ee_time" value="5"');

  // Escape clears the selection: sidebar returns to the empty state.
  await page.keyboard.press("Escape");
  await expect(card).toContainText("Узел не выбран", { timeout: 15_000 });
  await expect(page.locator('[data-testid="camunda-properties-group"]')).toHaveCount(0);

  expect(problems, problems.join("\n")).toEqual([]);
});
