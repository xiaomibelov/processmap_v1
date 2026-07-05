import { test, expect } from "@playwright/test";
import { apiLogin, setUiToken } from "../../frontend/e2e/helpers/e2eAuth.mjs";
import { API_BASE, createFixture, openFixture, seedXml } from "../../frontend/e2e/helpers/processFixture.mjs";
import { waitForDiagramReady } from "../../frontend/e2e/helpers/diagramReady.mjs";

const APP_BASE = process.env.E2E_APP_BASE_URL || "http://clearvestnic.ru:5177";
const API_BASE_URL = process.env.E2E_API_BASE_URL || APP_BASE;
const MIN_DEPLOY_SHA = (process.env.MIN_DEPLOY_SHA || "012f7f6bfd2547c8b4d0ad3f1e9c5a2997e5acc2").trim();

function shaSortKey(sha) {
  return String(sha || "").padStart(40, "0").toLowerCase();
}

async function authAndOpenSession(page, request, { xml } = {}) {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE_URL });
  const fixture = await createFixture(request, runId, auth.headers, xml || seedXml());

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });

  await setUiToken(page, auth.accessToken, {
    activeOrgId: auth.activeOrgId,
    refreshToken: auth.refreshToken,
    refreshCookie: auth.refreshCookie,
    appBaseUrl: APP_BASE,
  });

  if (auth.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }

  await openFixture(page, fixture);
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page);
  return { auth, fixture };
}

function xmlWithProperty(taskName, key, value) {
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
    <bpmn:userTask id="Task_1" name="${taskName}">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="${key}" value="${value}" />
        </camunda:properties>
      </bpmn:extensionElements>
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

test.describe("clearvestnic.ru post-deploy checks", () => {
  test("deploy version is recent", async ({ request }) => {
    const res = await request.get(`${APP_BASE}/version`);
    expect(res.ok(), "version endpoint unavailable").toBeTruthy();
    const data = await res.json();
    console.log("Deployed commit:", data.commit, "branch:", data.branch);
    expect(data.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(shaSortKey(data.commit) >= shaSortKey(MIN_DEPLOY_SHA)).toBe(true);
  });

  test("version modal has compact redesign layout", async ({ page, request }) => {
    await authAndOpenSession(page, request);

    await page.locator('[data-testid="diagram-toolbar-overflow-toggle"]').click();
    await page.waitForSelector('[data-testid="diagram-toolbar-overlay"]', { timeout: 5000 });
    await page.locator('[data-testid="bpmn-versions-open"]').click();

    const modal = page.locator('[data-testid="bpmn-versions-modal"]');
    await modal.waitFor({ state: "visible", timeout: 15000 });

    const box = await modal.boundingBox();
    expect(box, "modal bounding box not found").not.toBeNull();
    console.log("Modal height:", box.height);
    expect(box.height).toBeGreaterThanOrEqual(480);

    const technicalToggle = page.locator('[data-testid="bpmn-versions-show-technical"]');
    await expect(technicalToggle, "technical versions toggle missing").toBeVisible();

    const leftPanel = modal.locator("> *").first();
    const leftBox = await leftPanel.boundingBox();
    if (leftBox) {
      console.log("Left panel width:", leftBox.width);
      expect(leftBox.width).toBeGreaterThanOrEqual(250);
      expect(leftBox.width).toBeLessThanOrEqual(400);
    }

    await page.screenshot({ path: "/root/processmap_v1/scripts/e2e/version_modal_layout.png", fullPage: false });
  });

  test("restore version then save without CAS error", async ({ page, request }) => {
    await authAndOpenSession(page, request);

    let saveStatus = null;
    let saveBody = null;
    page.on("response", async (response) => {
      const req = response.request();
      const url = req.url();
      const method = req.method();
      if (url.includes("/api/sessions/") && (method === "PATCH" || method === "PUT")) {
        saveStatus = response.status();
        saveBody = await response.json().catch(() => null);
        console.log("save response after restore:", saveStatus, url, JSON.stringify(saveBody).slice(0, 200));
      }
    });

    await page.locator('[data-testid="diagram-toolbar-overflow-toggle"]').click();
    await page.waitForSelector('[data-testid="diagram-toolbar-overlay"]', { timeout: 5000 });
    await page.locator('[data-testid="bpmn-versions-open"]').click();

    const modal = page.locator('[data-testid="bpmn-versions-modal"]');
    await modal.waitFor({ state: "visible", timeout: 15000 });

    await page.locator('[data-testid="bpmn-versions-show-technical"]').click();
    const firstItem = page.locator('[data-testid="bpmn-version-item"]').first();
    await firstItem.waitFor({ state: "visible", timeout: 15000 });
    await page.screenshot({ path: "/root/processmap_v1/scripts/e2e/version_modal_with_technical.png", fullPage: false });
    await firstItem.locator('[data-testid="bpmn-version-restore"]').click();
    await page.waitForTimeout(1500);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const taskShape = page.locator('g[data-element-id="Task_1"]').first();
    await expect(taskShape).toBeVisible();
    await taskShape.click();

    const nodeSectionBtn = page.locator("[data-testid='left-sidebar-handle'] button[aria-label='Выбранный узел']");
    if (await nodeSectionBtn.isVisible().catch(() => false)) {
      await nodeSectionBtn.click();
    }

    const propertiesAccordion = page.locator(".sidebarAccordionHead").filter({ hasText: /^Свойства$/ }).first();
    await expect(propertiesAccordion).toBeVisible();
    await propertiesAccordion.click();

    const sectionToggle = page.locator(".sidebarPropertiesBlockTitle", { hasText: "Дополнительные BPMN-свойства" });
    await expect(sectionToggle).toBeVisible();
    await sectionToggle.locator("..").click();

    const key = `restoretest${Date.now()}`;
    const addBtn = page.locator("button", { hasText: "+ Добавить BPMN-свойство" }).first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await page.waitForTimeout(300);
    const rows = page.locator(".sidebarBpmnPropertyItem");
    await rows.last().waitFor({ state: "visible", timeout: 5000 });
    const lastRow = rows.last();
    const editBtn = lastRow.locator(".sidebarBpmnPropertyEditBtn");
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(200);
    }
    const inputs = lastRow.locator(".sidebarBpmnPropertyEditor input");
    await inputs.nth(0).fill(key);
    await inputs.nth(1).fill("value");

    const saveBtn = page.locator(".sidebarPropertiesBlock--secondary .primaryBtn", { hasText: "Сохранить" }).first();
    await saveBtn.click();
    await page.waitForTimeout(2500);

    expect(saveStatus, "no save request was observed after restore").not.toBeNull();
    expect(saveStatus).toBe(200);
    if (saveBody?.error) {
      console.error("Save error:", saveBody.error);
    }
    expect(saveBody?.error).toBeUndefined();

    const toast = page.locator('[data-testid="process-save-ack-toast"]');
    if (await toast.isVisible().catch(() => false)) {
      const toastText = await toast.textContent();
      console.log("Toast text:", toastText);
      expect(toastText).not.toContain("требуется обновить");
    }
  });

  test("property delete persists after save", async ({ page, request }) => {
    const xml = xmlWithProperty("Delete prop task", "toDelete", "will-be-removed");
    await authAndOpenSession(page, request, { xml });

    const taskShape = page.locator('g[data-element-id="Task_1"]').first();
    await expect(taskShape).toBeVisible();
    await taskShape.click();

    const nodeSectionBtn = page.locator("[data-testid='left-sidebar-handle'] button[aria-label='Выбранный узел']");
    if (await nodeSectionBtn.isVisible().catch(() => false)) {
      await nodeSectionBtn.click();
    }

    const propertiesAccordion = page.locator(".sidebarAccordionHead").filter({ hasText: /^Свойства$/ }).first();
    await expect(propertiesAccordion).toBeVisible();
    await propertiesAccordion.click();

    const sectionToggle = page.locator(".sidebarPropertiesBlockTitle", { hasText: "Дополнительные BPMN-свойства" });
    await expect(sectionToggle).toBeVisible();
    await sectionToggle.locator("..").click();

    const rows = page.locator(".sidebarBpmnPropertyItem");
    await expect(rows).toHaveCount(1);

    const deleteBtn = page.getByRole("button", { name: /Удалить BPMN-свойство/ });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    await expect(rows).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(rows).toHaveCount(0);

    const saveBtn = page.locator(".sidebarPropertiesBlock--secondary .primaryBtn", { hasText: "Сохранить" }).first();
    await saveBtn.click();
    await expect.poll(async () => rows.count()).toBe(0);

    await page.screenshot({ path: "/root/processmap_v1/scripts/e2e/property_panel_after_delete.png", fullPage: false });
  });

  test.skip("recipe calculator is visible in property panel", () => {
    // Recipe calculator lives on feat/recipe-calculator-mvp and is NOT merged to main.
    // clearvestnic.ru deploys origin/main, so this feature is intentionally absent.
    console.log("Recipe calculator skipped: feature branch not merged to main.");
  });
});
