// Shared boot/select/save helpers for sidebar e2e specs (sidebar-redesign-v2).
// Extracted so focused specs do not import each other (importing a spec file
// would re-register its tests).
import { expect } from "@playwright/test";

import { apiLogin, setUiToken } from "./e2eAuth.mjs";
import { API_BASE, createFixture } from "./processFixture.mjs";
import { waitForDiagramReady } from "./diagramReady.mjs";

// Pre-existing on main (verified at base commit 5aabba98): a dev-mode React
// warning loop — useBpmnSync returns a fresh object every render. Not caused
// by sidebar work; the collector filters ONLY this exact warning.
const PRE_EXISTING_UPDATE_DEPTH_WARNING = "Maximum update depth exceeded";

export function collectConsoleProblems(page) {
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

export async function ensureSidebarOpen(page) {
  const handle = page.locator('[data-testid="left-sidebar-handle"]');
  if (await handle.isVisible().catch(() => false)) {
    await handle.locator(".leftSidebarHandleOpenBtn").first().click();
    await page.waitForTimeout(300);
  }
}

export async function openPropertiesSection(page) {
  const head = page.locator('.sidebarAccordion[data-section-id="properties"] > .sidebarAccordionHead');
  await expect(head).toBeVisible({ timeout: 15_000 });
  if ((await head.getAttribute("aria-expanded").catch(() => "false")) !== "true") {
    await head.click();
    await page.waitForTimeout(300);
  }
}

export async function settleOrgChooser(page) {
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

export async function bootDiagram(page, request, runId, seedXml, { extraStorage = {} } = {}) {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers, seedXml);
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

export async function selectTask(page, taskId) {
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

export async function fetchBpmnXml(request, fixture) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn`, {
    headers: fixture.auth.headers,
  });
  const xml = await res.text();
  expect(res.ok(), `GET bpmn: ${xml.slice(0, 300)}`).toBeTruthy();
  expect(xml).toContain("bpmn:definitions");
  return xml;
}

export async function saveAll(page) {
  const putWait = page.waitForResponse(
    (res) => res.url().includes("/bpmn") && res.request().method() === "PUT",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Сохранить всё" }).click();
  const putRes = await putWait;
  expect(putRes.ok(), `PUT bpmn status ${putRes.status()}`).toBeTruthy();
}

export function taskBlock(xml, taskId) {
  const match = String(xml).match(new RegExp(`<bpmn:task id="${taskId}"[\\s\\S]*?</bpmn:task>`));
  expect(match, `task ${taskId} block must exist in saved XML`).toBeTruthy();
  return match[0];
}
