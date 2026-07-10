import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken, withAuthHeaders } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, seedXml } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function parseCamundaProps(xml) {
  const tags = [...String(xml || "").matchAll(/<camunda:property\b[^>]*>/g)].map((m) => m[0]);
  return tags
    .map((tag) => ({
      name: (tag.match(/\bname="([^"]*)"/) || [])[1],
      value: (tag.match(/\bvalue="([^"]*)"/) || [])[1],
    }))
    .filter((p) => typeof p.name === "string");
}

function propSummary(props) {
  return props.map((p) => `${p.name}=${p.value}`);
}

function duplicateNames(props) {
  const seen = new Set();
  const dups = new Set();
  for (const p of props) {
    if (seen.has(p.name)) dups.add(p.name);
    else seen.add(p.name);
  }
  return [...dups];
}

async function getServerBpmnXml(request, sessionId, token) {
  const res = await request.get(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn?include_overlay=0`,
    { headers: withAuthHeaders(token) },
  );
  if (!res.ok()) return "";
  return res.text();
}

async function getServerSession(request, sessionId, token) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, {
    headers: withAuthHeaders(token),
  });
  if (!res.ok()) return null;
  return res.json();
}

// Poll the server XML until the predicate is satisfied. This is the authoritative
// check that a save (per-property auto-save or global Save All) actually landed.
async function expectXmlProps(request, sessionId, token, predicate, { timeout = 20000, label = "" } = {}) {
  const start = Date.now();
  let last = [];
  while (Date.now() - start < timeout) {
    const xml = await getServerBpmnXml(request, sessionId, token);
    last = parseCamundaProps(xml);
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`XML props predicate not satisfied ${label}; last=${JSON.stringify(propSummary(last))}`);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

async function openTaskProperties(page) {
  const taskShape = page.locator('g[data-element-id="Task_1"]').first();
  await expect(taskShape).toBeVisible({ timeout: 20000 });
  await taskShape.click();

  const discussionsBtn = page.getByRole("button", { name: "Обсуждения" });
  await expect(discussionsBtn).toBeVisible({ timeout: 20000 });
  await discussionsBtn.click();

  const nodeSectionBtn = page.locator("[data-testid='left-sidebar-handle'] button[aria-label='Выбранный узел']");
  await expect(nodeSectionBtn).toBeVisible({ timeout: 20000 });
  await nodeSectionBtn.click();

  const propertiesAccordion = page.locator(".sidebarAccordionHead").filter({ hasText: /^Свойства$/ }).first();
  await expect(propertiesAccordion).toBeVisible({ timeout: 20000 });
  await propertiesAccordion.click();

  // Ensure the "Дополнительные BPMN-свойства" section is expanded.
  const addBtn = page.locator(".sidebarAddBtn").filter({ hasText: "Добавить BPMN-свойство" }).first();
  if (!(await addBtn.isVisible().catch(() => false))) {
    const toggle = page.locator(".sidebarPropertiesBlockToggle").filter({ hasText: "Дополнительные BPMN-свойства" }).first();
    if (await toggle.isVisible().catch(() => false)) await toggle.click();
  }
  await expect(addBtn).toBeVisible({ timeout: 15000 });
}

async function addProperty(page, name, value) {
  const addBtn = page.locator(".sidebarAddBtn").filter({ hasText: "Добавить BPMN-свойство" }).first();
  await addBtn.click();
  const rows = page.locator(".sidebarBpmnPropertyItem");
  const newRow = rows.last();
  await newRow.click();
  const nameInput = newRow.locator('input[placeholder="Название"]').first();
  const valueInput = newRow.locator('input[placeholder="Значение"]').first();
  await expect(nameInput).toBeVisible({ timeout: 10000 });
  await nameInput.fill(name);
  await valueInput.fill(value);
  await valueInput.press("Enter"); // commit -> updatePropertyRow -> auto-save
  // wait until the row leaves edit mode (committed)
  await expect(newRow.locator('input[placeholder="Название"]')).toHaveCount(0, { timeout: 10000 });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rowByName(page, name) {
  return page
    .locator(".sidebarBpmnPropertyItem")
    .filter({ has: page.locator(".sidebarSchemaPropertyHuman", { hasText: new RegExp(`^${escapeRegExp(name)}$`) }) })
    .first();
}

// Enter inline-edit mode for the row with the given (exact) name and return a
// locator for the row now in edit mode. Once in edit mode the
// `.sidebarSchemaPropertyHuman` span is replaced by inputs, so subsequent
// queries must target `.sidebarBpmnPropertyItem.isEditing`, not the name filter
// (otherwise the parent locator resolves to 0 elements mid-edit).
async function startEditByName(page, name) {
  const row = rowByName(page, name);
  await expect(row).toBeVisible({ timeout: 10000 });
  const pencil = row.locator('button[aria-label="Редактировать свойство"]').first();
  if (await pencil.isVisible().catch(() => false)) {
    await pencil.click();
  } else {
    await row.click();
  }
  const editing = page.locator(".sidebarBpmnPropertyItem.isEditing").first();
  await expect(editing).toBeVisible({ timeout: 10000 });
  return editing;
}

async function editPropertyValue(page, name, nextValue) {
  const editing = await startEditByName(page, name);
  const valueInput = editing.locator('input[placeholder="Значение"]').first();
  await valueInput.fill(nextValue);
  await valueInput.press("Enter");
  await expect(page.locator(".sidebarBpmnPropertyItem.isEditing")).toHaveCount(0, { timeout: 10000 });
}

async function deleteProperty(page, name) {
  const row = rowByName(page, name);
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator(".sidebarPropertyActionBtn--danger").first().click();
  await expect(row).toHaveCount(0, { timeout: 10000 });
}

async function clickSaveAll(page) {
  const btn = page.locator(".sidebarGlobalFooter .sidebarGlobalFooterBtn").filter({ hasText: "Сохранить всё" }).first();
  await expect(btn).toBeVisible({ timeout: 15000 });
  await expect(btn).toBeEnabled({ timeout: 15000 });
  await btn.click();
  // wait until the footer reports no pending changes (button disabled) again
  await expect(btn).toBeDisabled({ timeout: 20000 });
}

async function setupSession(page, request) {
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
    await page.addInitScript((uid) => window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1"), auth.userId);
  }
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page, { timeout: 45000 });
  return { auth, fixture };
}

// ---------------------------------------------------------------------------
// Scenarios 1-5: sequential lifecycle on a single session
// ---------------------------------------------------------------------------

test("audit: add/edit/delete lifecycle keeps XML free of duplicates", async ({ page, request }) => {
  const { auth, fixture } = await setupSession(page, request);
  const sid = fixture.sessionId;
  const token = auth.accessToken;
  const report = [];

  await openTaskProperties(page);

  // Scenario 1: add one property -> Save All -> exactly 1 in XML and in session meta.
  await addProperty(page, "test_prop", "value1");
  await clickSaveAll(page);
  let props = await expectXmlProps(request, sid, token, (p) => p.length === 1 && p[0].name === "test_prop" && p[0].value === "value1", { label: "S1" });
  expect(duplicateNames(props)).toEqual([]);
  const session1 = await getServerSession(request, sid, token);
  const meta1 = session1?.bpmn_meta?.camunda_extensions_by_element_id?.Task_1?.properties?.extensionProperties
    || session1?.bpmn_meta?.camunda_extensions_by_element_id?.Task_1?.properties
    || [];
  report.push({ s: 1, xml: propSummary(props), metaCount: Array.isArray(meta1) ? meta1.length : "n/a" });

  // Scenario 2: add second property -> Save All -> exactly 2, first not duplicated.
  await addProperty(page, "test_prop2", "value2");
  await clickSaveAll(page);
  props = await expectXmlProps(request, sid, token, (p) => p.length === 2 && p.some((x) => x.name === "test_prop") && p.some((x) => x.name === "test_prop2"), { label: "S2" });
  expect(duplicateNames(props)).toEqual([]);
  expect(props.filter((p) => p.name === "test_prop")).toHaveLength(1);
  report.push({ s: 2, xml: propSummary(props) });

  // Scenario 3: edit test_prop value1 -> value2 -> Save All; old value gone, single copy.
  await editPropertyValue(page, "test_prop", "value2");
  await clickSaveAll(page);
  props = await expectXmlProps(request, sid, token, (p) => {
    const tp = p.filter((x) => x.name === "test_prop");
    return tp.length === 1 && tp[0].value === "value2" && !p.some((x) => x.value === "value1");
  }, { label: "S3" });
  expect(duplicateNames(props)).toEqual([]);
  report.push({ s: 3, xml: propSummary(props) });

  // Scenario 4: delete test_prop; test_prop2 remains; no restore after 5s.
  await deleteProperty(page, "test_prop");
  props = await expectXmlProps(request, sid, token, (p) => !p.some((x) => x.name === "test_prop") && p.filter((x) => x.name === "test_prop2").length === 1, { label: "S4" });
  await page.waitForTimeout(5500);
  const propsAfterWait = parseCamundaProps(await getServerBpmnXml(request, sid, token));
  expect(propsAfterWait.some((p) => p.name === "test_prop")).toBe(false);
  report.push({ s: 4, xml: propSummary(props), after5s: propSummary(propsAfterWait) });

  // Scenario 5: delete last property; no empty camunda:properties container; stays gone after reload.
  await deleteProperty(page, "test_prop2");
  props = await expectXmlProps(request, sid, token, (p) => p.length === 0, { label: "S5" });
  const xml5 = await getServerBpmnXml(request, sid, token);
  expect(xml5.includes("<camunda:properties")).toBe(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDiagramReady(page, { timeout: 45000 });
  const propsAfterReload = parseCamundaProps(await getServerBpmnXml(request, sid, token));
  expect(propsAfterReload).toHaveLength(0);
  report.push({ s: 5, xmlAfterReload: propSummary(propsAfterReload), emptyContainer: !xml5.includes("<camunda:properties") });

  console.log("AUDIT_REPORT_1_5=" + JSON.stringify(report));
});

// ---------------------------------------------------------------------------
// Scenario 6: add -> save -> reload -> property present, single copy
// ---------------------------------------------------------------------------

test("audit S6: add then reload keeps a single copy", async ({ page, request }) => {
  const { auth, fixture } = await setupSession(page, request);
  const sid = fixture.sessionId;
  const token = auth.accessToken;
  await openTaskProperties(page);

  await addProperty(page, "roundtrip_test", "123");
  await clickSaveAll(page);
  const props = await expectXmlProps(request, sid, token, (p) => p.filter((x) => x.name === "roundtrip_test").length === 1 && p.find((x) => x.name === "roundtrip_test").value === "123", { label: "S6-pre" });
  expect(duplicateNames(props)).toEqual([]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDiagramReady(page, { timeout: 45000 });
  await openTaskProperties(page);

  const row = rowByName(page, "roundtrip_test");
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row.locator(".sidebarSchemaPropertyValueText")).toHaveText("123");

  const propsAfter = parseCamundaProps(await getServerBpmnXml(request, sid, token));
  expect(propsAfter.filter((p) => p.name === "roundtrip_test")).toHaveLength(1);
  console.log("AUDIT_REPORT_6=" + JSON.stringify({ xml: propSummary(propsAfter) }));
});

// ---------------------------------------------------------------------------
// Scenario 7: inline edit -> global Save All -> saved once, no rollback
// ---------------------------------------------------------------------------

test("audit S7: inline edit then Save All persists without duplicates", async ({ page, request }) => {
  const { auth, fixture } = await setupSession(page, request);
  const sid = fixture.sessionId;
  const token = auth.accessToken;
  await openTaskProperties(page);

  await addProperty(page, "s7", "old");
  await clickSaveAll(page);
  await expectXmlProps(request, sid, token, (p) => p.some((x) => x.name === "s7" && x.value === "old"), { label: "S7-seed" });

  // Inline-edit the value. Enter commits the change into the local draft
  // (this does NOT trigger a per-property server save), then Save All persists.
  const editing = await startEditByName(page, "s7");
  const valueInput = editing.locator('input[placeholder="Значение"]').first();
  await valueInput.fill("new");
  await valueInput.press("Enter");
  await expect(page.locator(".sidebarBpmnPropertyItem.isEditing")).toHaveCount(0, { timeout: 10000 });
  await clickSaveAll(page);

  const props = await expectXmlProps(request, sid, token, (p) => {
    const s7 = p.filter((x) => x.name === "s7");
    return s7.length === 1 && s7[0].value === "new" && !p.some((x) => x.value === "old");
  }, { label: "S7" });
  expect(duplicateNames(props)).toEqual([]);
  console.log("AUDIT_REPORT_7=" + JSON.stringify({ xml: propSummary(props) }));
});

// ---------------------------------------------------------------------------
// Scenario 8: rapidly add 3 properties -> global Save All -> exactly 3, no dups
// ---------------------------------------------------------------------------

test("audit S8: rapidly add 3 then Save All yields exactly 3 unique", async ({ page, request }) => {
  const { auth, fixture } = await setupSession(page, request);
  const sid = fixture.sessionId;
  const token = auth.accessToken;
  await openTaskProperties(page);

  await addProperty(page, "a", "1");
  await addProperty(page, "b", "2");
  await addProperty(page, "c", "3");
  await clickSaveAll(page);

  const props = await expectXmlProps(request, sid, token, (p) => p.length === 3 && ["a", "b", "c"].every((n) => p.some((x) => x.name === n)), { label: "S8" });
  expect(duplicateNames(props)).toEqual([]);
  const valueByName = Object.fromEntries(props.map((p) => [p.name, p.value]));
  expect(valueByName).toMatchObject({ a: "1", b: "2", c: "3" });
  console.log("AUDIT_REPORT_8=" + JSON.stringify({ xml: propSummary(props) }));
});
