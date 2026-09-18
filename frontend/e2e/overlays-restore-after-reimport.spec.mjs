// E2E-спека среза fix/canvas-overlays-preferences-409 (F1) — overlay re-attach
// после re-import (audit H3, CONFIRMED).
//
// importXML → diagram.clear уничтожает все overlay-ноды (diagram-js
// Overlays.js). До фикса пути re-import без restore (409-rebase, SSE full,
// recover2/3) теряли V2-карточки навсегда, а «покрытые» пути не работали
// из-за sig-кэшей. Спека фиксирует UX-контракт: после ЛЮБОГО re-import
// overlay-слой на месте, без дублирующих DOM-нод.
//
// Сценарии:
//   (a) 409-rebase (route-инъекция 409 с server_current_xml) → оверлеи на месте.
//   (b) SSE full:true (синтетический EventSource-ивент) → оверлеи на месте.
//   (c) recover2/recover3 (canvas probe invisible → tab switch) → оверлеи на месте.
//   (d) закрытие/переоткрытие вкладки → оверлеи на месте.
//   (e) повторный import → без дублирующих overlay-нод (идемпотентность).
//
// Скриншоты до/после: frontend/test-results/overlays-restore/<scenario>-*.png.

import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";
import { readServerDiagramStateVersion } from "./helpers/canvasStabilitySteps.mjs";

const TASK_A = "Task_restoreA";
const TASK_B = "Task_restoreB";
const SHOTS_DIR = path.resolve("test-results", "overlays-restore");

const FLUSH_WAIT_MS = 15_000;

// ---------------------------------------------------------------------------
// Фикстура: две задачи с fpc-show-properties → две V2-карточки.
// ---------------------------------------------------------------------------

function seedXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_restore"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_restore" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="${TASK_A}" name="Task A">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="prop_alpha" value="alpha-value" />
          <camunda:property name="fpc-show-properties" value="true" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:task id="${TASK_B}" name="Task B">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="prop_beta" value="beta-value" />
          <camunda:property name="fpc-show-properties" value="true" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="${TASK_A}" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="${TASK_A}" targetRef="${TASK_B}" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="${TASK_B}" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Diagram">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_restore">
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

// ---------------------------------------------------------------------------
// SSE-проба: оборачиваем EventSource, держим инстансы для синтетических
// событий (сценарий b/e — имитация серверного ops_committed full:true).
// ---------------------------------------------------------------------------

async function installSseProbe(page) {
  await page.addInitScript(() => {
    window.__PM_E2E_SSE__ = [];
    window.__PM_E2E_SSE_INSTANCES__ = [];
    const Original = window.EventSource;
    if (!Original) return;
    window.EventSource = class extends Original {
      constructor(url, options) {
        super(url, options);
        window.__PM_E2E_SSE_INSTANCES__.push(this);
        this.addEventListener("ops_committed", (event) => {
          try {
            window.__PM_E2E_SSE__.push(JSON.parse(event.data || "{}"));
          } catch {
            window.__PM_E2E_SSE__.push({ parseError: true });
          }
        });
      }
    };
  });
}

async function pushSyntheticSseFull(page, sessionId, version) {
  await page.evaluate(({ sid, ver }) => {
    const es = (window.__PM_E2E_SSE_INSTANCES__ || [])[0];
    if (!es) throw new Error("no EventSource instance");
    es.dispatchEvent(new MessageEvent("ops_committed", {
      data: JSON.stringify({
        session_id: sid,
        version: ver,
        full: true,
        actor_client_id: "e2e-foreign-client",
      }),
    }));
  }, { sid: sessionId, ver: version });
}

// ---------------------------------------------------------------------------
// Хелперы канваса/оверлеев
// ---------------------------------------------------------------------------

function v2Host(page, elementId) {
  return page.locator(`.fpc-overlay-v2-host[data-fpc-element-id="${elementId}"]`);
}

async function expectV2Hosts(page, elementIds = [TASK_A, TASK_B]) {
  for (const elementId of elementIds) {
    await expect(v2Host(page, elementId)).toHaveCount(1, { timeout: 20_000 });
  }
}

function readOverlayHostCount(page) {
  return page.evaluate(() => document.querySelectorAll(".fpc-overlay-v2-host").length);
}

function readModelerRef(page) {
  return page.evaluate(() => {
    const m = window.__FPC_E2E_MODELER__ || null;
    return m ? "modeler" : null;
  }).then((tag) => (tag ? page.evaluate(() => window.__FPC_E2E_MODELER__) : null));
}

async function renameElement(page, elementId, marker) {
  const result = await page.evaluate((arg) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const el = registry.get(arg.elementId);
      if (!el) return { ok: false, error: "element_missing:" + arg.elementId };
      modeling.updateLabel(el, arg.marker);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { elementId, marker });
  expect(result.ok, `rename ${elementId}: ${JSON.stringify(result)}`).toBeTruthy();
}

async function waitForElementName(page, elementId, expected, timeoutMs = 30_000) {
  await expect
    .poll(
      async () => {
        return page.evaluate(({ id, name }) => {
          const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
          return String(modeler?.get("elementRegistry")?.get(id)?.businessObject?.name || "");
        }, { id: elementId, name: expected });
      },
      { timeout: timeoutMs, message: `${elementId} name must become "${expected}"` },
    )
    .toBe(expected);
}

function triggerFlush(page) {
  return page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
  });
}

async function screenshotStep(page, name) {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: false });
}

// Переключение табов процесса: в этом стеке табы — role=tab в tablist
// «Process tabs» (shared-helper switchTab ищет устаревший .segBtn).
async function switchProcessTab(page, name) {
  const tab = page.getByRole("tab", { name: new RegExp(name, "i") }).first();
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// Бутстрап: фикстура + V2-оверлеи включены
// ---------------------------------------------------------------------------

async function ensureSidebarOpen(page) {
  const handle = page.locator('[data-testid="left-sidebar-handle"]');
  if (await handle.isVisible().catch(() => false)) {
    await handle.locator(".leftSidebarHandleOpenBtn").first().click();
    await page.waitForTimeout(300);
  }
}

async function openPropertiesSection(page) {
  const head = page.locator('.sidebarAccordion[data-section-id="properties"] > .sidebarAccordionHead');
  if ((await head.getAttribute("aria-expanded").catch(() => "false")) !== "true") {
    await head.click();
    await page.waitForTimeout(300);
  }
}

async function setV2Overlays(page, on) {
  const toggle = page.locator('[data-testid="v2-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute("aria-checked")) !== (on ? "true" : "false")) {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-checked", on ? "true" : "false");
}

async function bootDiagramWithV2(page, request, runId) {
  const auth = await apiLogin(request, { apiBase: API_BASE });
  // V2-оверлеи гейтятся серверным feature-флагом useBpmnExtensionOverlays
  // (default 0 в чистом стеке) — включаем админски, иначе mount не стартует.
  const flagsRes = await request.patch(`${API_BASE}/api/admin/feature-flags`, {
    headers: auth.headers,
    data: { flags: { useBpmnExtensionOverlays: true } },
  });
  expect(flagsRes.ok(), `enable feature flag: ${flagsRes.status()}`).toBeTruthy();
  const fixture = await createFixture(request, runId, auth.headers, seedXml());
  await setUiToken(page, auth.accessToken);
  const orgId = String(fixture.orgId || auth.activeOrgId || "").trim();
  await page.addInitScript((value) => {
    if (value) window.localStorage.setItem("fpc_active_org_id", value);
  }, orgId);
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  const chooser = page.getByText("Выберите организацию").first();
  for (let i = 0; i < 40; i += 1) {
    if (await chooser.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /Default/i }).first().click();
      break;
    }
    if (await page.locator(".bpmnStageHost").isVisible().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  await waitForDiagramReady(page);

  await ensureSidebarOpen(page);
  await openPropertiesSection(page);
  await setV2Overlays(page, true);
  await expectV2Hosts(page);
  // Сайдбар сужает контент и прячет табы процесса — сворачиваем обратно,
  // чтобы сценарии (переключение табов) могли кликать .segBtn.
  const collapse = page.getByRole("button", { name: "Скрыть панель" });
  if (await collapse.isVisible().catch(() => false)) {
    await collapse.click();
    await page.waitForTimeout(300);
  }
  return { auth, fixture };
}

async function fetchServerXml(request, sessionId, headers) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn?raw=1`, { headers });
  expect(res.ok(), `GET bpmn status=${res.status()}`).toBeTruthy();
  return res.text();
}

// ---------------------------------------------------------------------------
// (a) 409-rebase → оверлеи на месте
// ---------------------------------------------------------------------------

test("overlays restore after reimport: 409-rebase keeps V2 overlay cards", async ({ page, request }) => {
  const runId = `ovr409_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { auth, fixture } = await bootDiagramWithV2(page, request, runId);
  await screenshotStep(page, "a-409-before");

  const serverVersion = await readServerDiagramStateVersion(page, fixture.sessionId, auth.headers);
  const serverXml = await fetchServerXml(request, fixture.sessionId, auth.headers);

  // Одноразовая инъекция 409 DIAGRAM_STATE_CONFLICT с серверным XML —
  // детерминированный 409-rebase (UI.md §5) без второго клиента.
  let injected = 0;
  const conflicts = [];
  page.on("response", (response) => {
    if (response.status() === 409) conflicts.push(response.url());
  });
  await page.route(/\/api\/sessions\/[^/]+\/operations$/, async (route) => {
    if (route.request().method() !== "POST" || injected > 0) {
      await route.continue();
      return;
    }
    injected += 1;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          code: "DIAGRAM_STATE_CONFLICT",
          server_current_version: serverVersion,
          server_current_xml: serverXml,
        },
      }),
    });
  });

  const marker = `REBASE_${runId}`;
  await renameElement(page, TASK_A, marker);
  await triggerFlush(page);

  // Outbox-флейш должен упереться в инъектированный 409 ровно один раз.
  await expect
    .poll(() => conflicts.length, {
      timeout: FLUSH_WAIT_MS,
      message: "exactly one injected 409 expected",
    })
    .toBe(1);

  // Rebase replay обязан довезти переименование до сервера повторным flush.
  await expect
    .poll(async () => (await fetchServerXml(request, fixture.sessionId, auth.headers)).includes(marker) ? 1 : 0, {
      timeout: FLUSH_WAIT_MS + 10_000,
      message: "server XML must contain rename marker after rebase replay",
    })
    .toBe(1);

  // Главная проверка F1: после re-import (loadServerXml → runtime.load) V2
  // карточки на месте — ровно по одной на элемент.
  await expectV2Hosts(page);
  await screenshotStep(page, "a-409-after");
});

// ---------------------------------------------------------------------------
// (b) SSE full:true → оверлеи на месте
// ---------------------------------------------------------------------------

test("overlays restore after reimport: SSE full event rebase keeps V2 overlay cards", async ({ page, request }) => {
  const runId = `ovsse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await installSseProbe(page);
  const { auth, fixture } = await bootDiagramWithV2(page, request, runId);
  await screenshotStep(page, "b-sse-before");

  // Контроль факта rebase: full-rebase делает GET /bpmn (fetchServerXml).
  let bpmnFetches = 0;
  page.on("request", (req) => {
    if (req.method() === "GET" && /\/api\/sessions\/[^/]+\/bpmn/.test(req.url())) bpmnFetches += 1;
  });
  const bpmnFetchesBefore = bpmnFetches;

  const version = await readServerDiagramStateVersion(page, fixture.sessionId, auth.headers);
  await pushSyntheticSseFull(page, fixture.sessionId, version + 1);

  // Rebase реально произошёл (а не stale-drop и не no-op).
  await expect
    .poll(() => bpmnFetches > bpmnFetchesBefore ? 1 : 0, {
      timeout: 20_000,
      message: "full-rebase must fetch server XML",
    })
    .toBe(1);

  // F1: после runtime.load в SSE-full пути карточки восстановлены.
  await expectV2Hosts(page);
  await screenshotStep(page, "b-sse-after");
});

// ---------------------------------------------------------------------------
// (c) recover2/recover3 (viewportRecovery trigger) → оверлеи на месте
// ---------------------------------------------------------------------------

test("overlays restore after reimport: canvas recovery (recover2/recover3) keeps V2 overlay cards", async ({ page, request }) => {
  const runId = `ovrec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { fixture } = await bootDiagramWithV2(page, request, runId);
  await screenshotStep(page, "c-recover-before");

  const modelerBefore = await readModelerRef(page);

  // Детерминированный «невидимый канвас»: visibility:hidden на bjs-container
  // не снимается recover1 (resize/fit) → ensureVisible уходит в recover2
  // (re-import) и recover3 (hard reset с пересозданием инстанса).
  await page.evaluate(() => {
    const container = document.querySelector(".bpmnStageHost .bjs-container")
      || document.querySelector(".bjs-container");
    if (!container) throw new Error("bjs-container not found");
    container.style.visibility = "hidden";
  });

  await switchProcessTab(page, "Анализ процессов");
  await page.waitForTimeout(500);
  await switchProcessTab(page, "Diagram");

  // Recovery обязана завершиться пересозданием инстанса (recover3) — иначе
  // сценарий не тот, и проверка оверлеев была бы ложноположительной.
  await expect
    .poll(
      async () => {
        const current = await readModelerRef(page);
        return current && modelerBefore && current !== modelerBefore ? 1 : 0;
      },
      { timeout: 60_000, message: "hard reset (recover3) must recreate the modeler instance" },
    )
    .toBe(1);

  // Канвас снова видим, карточки на месте, без дублей.
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const container = document.querySelector(".bpmnStageHost .bjs-container")
          || document.querySelector(".bjs-container");
        if (!container) return 0;
        const style = window.getComputedStyle(container);
        const rect = container.getBoundingClientRect();
        return style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 ? 1 : 0;
      });
    }, { timeout: 30_000, message: "canvas must be visible after recovery" })
    .toBe(1);
  await expectV2Hosts(page);
  await screenshotStep(page, "c-recover-after");
});

// ---------------------------------------------------------------------------
// (d) закрытие/переоткрытие вкладки → оверлеи на месте
// ---------------------------------------------------------------------------

test("overlays restore after reimport: closing and reopening the tab keeps V2 overlay cards", async ({ page, context, request }) => {
  const runId = `ovtab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { fixture } = await bootDiagramWithV2(page, request, runId);
  await screenshotStep(page, "d-tab-before");

  const sessionUrl = page.url();
  await page.close();

  const page2 = await context.newPage();
  await page2.goto(sessionUrl);
  await page2.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page2);
  await expectV2Hosts(page2);
  await screenshotStep(page2, "d-tab-after");
});

// ---------------------------------------------------------------------------
// (e) повторный import → без дублирующих overlay-нод
// ---------------------------------------------------------------------------

test("overlays restore after reimport: repeated imports do not duplicate overlay nodes", async ({ page, request }) => {
  const runId = `ovdup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await installSseProbe(page);
  const { auth, fixture } = await bootDiagramWithV2(page, request, runId);

  let bpmnFetches = 0;
  page.on("request", (req) => {
    if (req.method() === "GET" && /\/api\/sessions\/[^/]+\/bpmn/.test(req.url())) bpmnFetches += 1;
  });

  const baseVersion = await readServerDiagramStateVersion(page, fixture.sessionId, auth.headers);
  for (let i = 1; i <= 3; i += 1) {
    await pushSyntheticSseFull(page, fixture.sessionId, baseVersion + i);
    await expect
      .poll(() => bpmnFetches >= i ? 1 : 0, { timeout: 20_000, message: `rebase #${i} must fetch server XML` })
      .toBe(1);
  }

  // После трёх re-import подряд — ровно по одной карточке на элемент.
  await expectV2Hosts(page);
  const totalHosts = await readOverlayHostCount(page);
  expect(totalHosts, "no duplicate overlay hosts after repeated imports").toBe(2);
  await screenshotStep(page, "e-dedup-after");
});
