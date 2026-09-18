import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { createFixture, API_BASE, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = process.env.E2E_EVIDENCE_DIR
  || path.resolve(SPEC_DIR, "../../../../../../.planning/contours/fix/template-roundtrip-artifacts/evidence/e2e");

function writeEvidence(name, content) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), String(content ?? ""), "utf8");
}

async function apiJson(res, label) {
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  expect(res.ok(), `${label}: status=${res.status()} body=${text}`).toBeTruthy();
  return body;
}

async function openDiagramSession(page, fixture) {
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
    window.localStorage.setItem("fpc_debug_packs", "1");
  });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
}

// Подписывается ДО навигации: собирает console/pageerror для assertion
// «no raw isGeneric» из контуров Tasks 3–4 (unknown semantic namespace).
function trackRawErrors(page) {
  const raw = { consoleErrors: [], pageErrors: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      raw.consoleErrors.push(String(msg.text() || ""));
    }
  });
  page.on("pageerror", (error) => {
    raw.pageErrors.push(String(error?.message || error));
  });
  return raw;
}

function expectNoRawIsGeneric(raw, extraToastText = "") {
  const haystack = [...raw.consoleErrors, ...raw.pageErrors, extraToastText].join("\n");
  expect(haystack, `raw isGeneric/errors found:\n${haystack}`).not.toMatch(/isGeneric/i);
  expect(raw.pageErrors, `page errors:\n${raw.pageErrors.join("\n")}`).toEqual([]);
}

async function toastText(page) {
  const viewport = page.getByTestId("process-toast-viewport");
  return (await viewport.isVisible().catch(() => false))
    ? String(await viewport.textContent().catch(() => "") || "")
    : "";
}

// Capture выделенного фрагмента через UI (overflow-меню -> модалка).
async function captureTemplateViaUi(page, name) {
  const overflowToggle = page.getByTestId("diagram-toolbar-overflow-toggle");
  await expect(overflowToggle).toBeVisible();
  await overflowToggle.click();
  const addTemplate = page.getByTestId("diagram-add-template");
  await expect(addTemplate).toBeVisible();
  await addTemplate.click();

  await expect(page.getByTestId("modal-create-template")).toBeVisible();
  await page.getByTestId("input-template-name").fill(name);

  let scope = "personal";
  const orgScope = page.getByTestId("create-template-scope-org");
  const orgDisabled = await orgScope.isDisabled().catch(() => true);
  if (!orgDisabled) {
    await orgScope.click();
    scope = "org";
  }

  const postResponse = page.waitForResponse((resp) => {
    return resp.request().method() === "POST"
      && /\/api\/templates(?:\?|$)/.test(resp.url())
      && resp.status() === 200;
  });
  await page.getByTestId("btn-save-template").click();
  const response = await postResponse;
  const body = await response.json();
  const id = String(body?.item?.id || "").trim();
  expect(id).not.toBe("");
  return { id, scope };
}

// Открывает пикер шаблонов, выбирает строку и жмёт «Применить в сессию».
async function applyTemplateViaUi(page, templateId, scope) {
  const templatesButton = page.getByTestId("btn-templates");
  await expect(templatesButton).toBeVisible();
  await templatesButton.click();
  await expect(page.getByTestId("templates-menu-panel")).toBeVisible();

  const scopeTab = scope === "org"
    ? page.getByTestId("templates-menu-scope-org")
    : page.getByTestId("templates-menu-scope-my");
  await expect(scopeTab).toBeVisible();
  await scopeTab.click();

  const row = page.getByTestId(`template-item-${templateId}`);
  await expect(row).toBeVisible({ timeout: 20000 });
  await page.getByTestId(`btn-select-template-${templateId}`).click();
  await page.getByTestId("templates-footer-apply").click();
}

// Клик по канвасу в режиме placement (ghost -> фиксация точки вставки).
async function placeFragmentOnCanvas(page, sessionId) {
  const putResponse = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && new RegExp(`/api/sessions/${sessionId}/bpmn(?:\\?|$)`).test(resp.url())
      && resp.status() === 200;
  }, { timeout: 30000 });

  await page.evaluate(() => {
    window.__FPC_E2E_TEMPLATE_FRAGMENT_INSERT__ = null;
  });
  const host = page.locator(".bpmnStageHost").first();
  await expect(host).toBeVisible();
  const box = await host.boundingBox();
  expect(box).toBeTruthy();
  const x = Number(box.x) + Math.max(120, Math.round(Number(box.width) * 0.6));
  const y = Number(box.y) + Math.max(80, Math.round(Number(box.height) * 0.4));
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await expect
    .poll(async () => {
      return await page.evaluate(() => Boolean(window.__FPC_E2E_TEMPLATE_FRAGMENT_INSERT__?.ok));
    }, { timeout: 15000 })
    .toBeTruthy();
  await putResponse;
  await page.waitForTimeout(400);
  const text = await toastText(page);
  if (await page.getByTestId("bpmn-fragment-ghost").isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
  }
  return text;
}

// Факты из saveXML моделера: dataInput/dataOutput associations, id-set, имена.
async function readXmlFacts(page) {
  return page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const { xml } = await modeler.saveXML({ format: true });
    const doc = new DOMParser().parseFromString(String(xml || ""), "text/xml");
    const byTag = (tag) => Array.from(doc.getElementsByTagNameNS("*", tag));
    const readAssoc = (tag) => byTag(tag).map((el) => ({
      id: el.getAttribute("id") || "",
      sourceRef: el.getAttribute("sourceRef") || "",
      targetRef: el.getAttribute("targetRef") || "",
    }));
    const idSet = new Set();
    Array.from(doc.getElementsByTagNameNS("*", "*")).forEach((node) => {
      const id = node.getAttribute && node.getAttribute("id");
      if (id) idSet.add(id);
    });
    const names = {};
    byTag("task").forEach((el) => {
      const name = String(el.getAttribute("name") || "").trim();
      if (name) names[name] = el.getAttribute("id") || "";
    });
    return {
      ok: true,
      xml: String(xml || ""),
      dataInputAssociations: readAssoc("dataInputAssociation"),
      dataOutputAssociations: readAssoc("dataOutputAssociation"),
      dataStoreRefs: byTag("dataStoreReference").map((el) => el.getAttribute("id") || ""),
      assocs: readAssoc("association"),
      ids: Array.from(idSet),
      names,
    };
  });
}

function buildPack({ title, nodes, edges, entryNodeId, exitNodeId }) {
  const fragment = { nodes, edges, annotations: [] };
  return {
    pack: {
      title,
      tags: ["e2e"],
      captureMode: "selection_fragment",
      fragment,
      entryNodeId,
      exitNodeId,
      hints: { defaultLaneName: "", defaultActor: "", suggestedInsertMode: "after" },
    },
    fragment,
    bbox: { w: 600, h: 400 },
    entry_node_id: entryNodeId,
    exit_node_id: exitNodeId,
    hints: {},
    source: "e2e_api",
  };
}

function makeNode(id, type, name, x, y, w = 140, h = 80, semanticPayload = {}) {
  return { id, type, name, laneHint: "", semanticPayload, di: { x, y, w, h } };
}

function makeEdge(id, edgeType, sourceId, targetId) {
  return { id, edgeType, sourceId, targetId, when: "", semanticPayload: {} };
}

async function createTemplateViaApi(request, headers, name, payload) {
  const res = await request.post(`${API_BASE}/api/templates`, {
    headers,
    data: {
      scope: "personal",
      template_type: "bpmn_fragment_v1",
      name,
      description: "",
      folder_id: "",
      payload,
    },
  });
  const body = await apiJson(res, `create template ${name}`);
  const id = String(body?.item?.id || "").trim();
  expect(id).not.toBe("");
  return id;
}

async function fetchRawBpmn(request, headers, sessionId) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn?raw=1`, { headers });
  expect(res.ok(), `raw bpmn status=${res.status()}`).toBeTruthy();
  return res.text();
}

test("1: unknown semantic namespace pack — apply/save/tab-switch без crash и без raw isGeneric", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateName = `Unknown Ns Pack ${runId.slice(-6)}`;
  const raw = trackRawErrors(page);
  const auth = await apiLogin(request, { apiBase: API_BASE });

  // Pack с семантикой неизвестного неймспейса foo:ArtifactProbe (Tasks 2–3).
  const payload = buildPack({
    title: templateName,
    nodes: [
      makeNode("TPL_U_T1", "bpmn:Task", "Unknown NS Task", 400, 300, 140, 80, {
        extensionElements: {
          $type: "bpmn:ExtensionElements",
          values: [{ $type: "foo:ArtifactProbe", value: "probe" }],
        },
      }),
    ],
    edges: [],
    entryNodeId: "TPL_U_T1",
    exitNodeId: "TPL_U_T1",
  });
  const templateId = await createTemplateViaApi(request, auth.headers, templateName, payload);

  const fixture = await createFixture(request, runId, auth.headers);
  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  await openDiagramSession(page, fixture);

  await applyTemplateViaUi(page, templateId, "personal");
  await placeFragmentOnCanvas(page, fixture.sessionId);

  const facts = await readXmlFacts(page);
  expect(facts.ok, JSON.stringify(facts)).toBeTruthy();
  expect(Object.keys(facts.names)).toContain("Unknown NS Task");
  writeEvidence("e2e-unknown-ns-post-apply.xml", facts.xml);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-unknown-ns-canvas.png") });

  // Save + tab switch (save-before-switch): не должно быть crash/raw isGeneric.
  await switchTab(page, "Overview");
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const rawXml = await fetchRawBpmn(request, auth.headers, fixture.sessionId);
  writeEvidence("e2e-unknown-ns-raw.xml", rawXml);
  expect(rawXml).toContain("Unknown NS Task");

  const toast = await toastText(page);
  expectNoRawIsGeneric(raw, toast);
  writeEvidence("e2e-unknown-ns-console.txt", [
    ...raw.consoleErrors.map((line) => `[console] ${line}`),
    ...raw.pageErrors.map((line) => `[pageerror] ${line}`),
  ].join("\n"));
});

test("2: datastore + dataInputAssociation fragment — capture/apply/F5: связи есть или явное предупреждение", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateName = `Datastore Pack ${runId.slice(-6)}`;
  const raw = trackRawErrors(page);
  const auth = await apiLogin(request, { apiBase: API_BASE });

  const fixtureA = await createFixture(request, runId, auth.headers);
  const fixtureB = await createFixture(request, `${runId}_B`, auth.headers);

  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  await openDiagramSession(page, fixtureA);

  // Фрагмент: task + dataStoreReference + dataInputAssociation (store -> task).
  const created = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const selection = modeler.get("selection");
      const anchor = registry.get("Task_1")
        || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")));
      if (!anchor) return { ok: false, error: "anchor_missing" };
      const root = anchor.parent;
      const task = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(anchor.x || 0) + 420, y: Number(anchor.y || 0) + 200 },
        root,
      );
      modeling.updateLabel(task, "Datastore Task");
      const store = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:DataStoreReference" }),
        { x: Number(task.x || 0) + 420, y: Number(task.y || 0) + 260 },
        root,
      );
      const assoc = modeling.connect(store, task, { type: "bpmn:DataInputAssociation" });
      selection.select([task, store, assoc]);
      return {
        ok: true,
        taskId: task.id,
        storeId: store.id,
        assocId: assoc?.id || "",
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(created.ok, JSON.stringify(created)).toBeTruthy();

  const { id: templateId, scope } = await captureTemplateViaUi(page, templateName);

  await openSessionInTopbar(page, fixtureB);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await applyTemplateViaUi(page, templateId, scope);
  const applyToast = await placeFragmentOnCanvas(page, fixtureB.sessionId);

  // F5: persisted raw XML — либо связи на месте, либо явное предупреждение.
  await page.reload();
  await waitForDiagramReady(page);
  const facts = await readXmlFacts(page);
  expect(facts.ok, JSON.stringify(facts)).toBeTruthy();
  writeEvidence("e2e-datastore-post-reload.xml", facts.xml);

  const rawXml = await fetchRawBpmn(request, auth.headers, fixtureB.sessionId);
  writeEvidence("e2e-datastore-raw.xml", rawXml);

  const linksPresent = facts.dataInputAssociations.length > 0
    && facts.dataInputAssociations.some((a) => a.sourceRef && a.targetRef);
  const explicitWarning = /Вставлено не полностью|пропущены элементы|Пересоздайте шаблон/.test(applyToast)
    || /Вставлено не полностью|пропущены элементы|Пересоздайте шаблон/.test(await toastText(page));
  expect(
    linksPresent || explicitWarning,
    `neither links present (assocs=${JSON.stringify(facts.dataInputAssociations)}) nor explicit warning (toast="${applyToast}")`,
  ).toBeTruthy();

  await page.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-datastore-canvas.png") });
  expectNoRawIsGeneric(raw, applyToast);
});

test("3: pool/lane fragment — capture/apply без invalid ops, full-save copy ясная", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateName = `Pool Lane Pack ${runId.slice(-6)}`;
  const raw = trackRawErrors(page);
  const auth = await apiLogin(request, { apiBase: API_BASE });

  const fixtureA = await createFixture(request, runId, auth.headers);
  const fixtureB = await createFixture(request, `${runId}_B`, auth.headers);

  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  await openDiagramSession(page, fixtureA);

  // Фрагмент: participant + lane + task внутри lane.
  const created = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const selection = modeler.get("selection");
      const anchor = registry.get("Task_1")
        || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")));
      if (!anchor) return { ok: false, error: "anchor_missing" };
      const root = anchor.parent;
      const pool = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Participant", isExpanded: true }),
        { x: Number(anchor.x || 0) + 500, y: Number(anchor.y || 0) + 260, width: 620, height: 260 },
        root,
      );
      const lane = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Lane" }),
        { x: Number(pool.x || 0) + 30, y: Number(pool.y || 0) + 40, width: 560, height: 180 },
        pool,
      );
      const task = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(lane.x || 0) + 160, y: Number(lane.y || 0) + 60 },
        lane,
      );
      modeling.updateLabel(task, "Pool Lane Task");
      selection.select([pool, lane, task]);
      return { ok: true, poolId: pool.id, laneId: lane.id, taskId: task.id };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(created.ok, JSON.stringify(created)).toBeTruthy();

  const { id: templateId, scope } = await captureTemplateViaUi(page, templateName);

  await openSessionInTopbar(page, fixtureB);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await applyTemplateViaUi(page, templateId, scope);
  const applyToast = await placeFragmentOnCanvas(page, fixtureB.sessionId);

  // Save успешен (PUT 200 уже дождался placeFragmentOnCanvas): invalid ops
  // должны были уйти в full-save fallback (Tasks 5–6, 9), а не в ошибку.
  expect(applyToast, `unexpected apply error toast: ${applyToast}`).not.toMatch(/ошибка|error|failed|не удалось/i);

  // Full-save copy ясная: слот статуса сохранения показывает полное сохранение
  // (ops-degraded copy Task 9), а не raw error detail.
  const slot = page.getByTestId("diagram-toolbar-save-status-slot");
  const slotText = (await slot.isVisible().catch(() => false))
    ? `${await slot.textContent().catch(() => "")} ${await slot.getAttribute("title").catch(() => "")}`
    : "";
  expect(
    /Сохраняем полностью|полное сохранение|Данные не потеряны/i.test(slotText)
      || /Сохраняем полностью|полное сохранение|Данные не потеряны/i.test(applyToast),
    `no clear full-save copy in slot/toast (slot="${slotText}", toast="${applyToast}")`,
  ).toBeTruthy();
  expect(slotText).not.toMatch(/isGeneric|TypeError|undefined/i);

  // F5: фрагмент целиком, persisted XML содержит pool/lane task.
  await page.reload();
  await waitForDiagramReady(page);
  const facts = await readXmlFacts(page);
  expect(facts.ok, JSON.stringify(facts)).toBeTruthy();
  writeEvidence("e2e-pool-lane-post-reload.xml", facts.xml);
  expect(Object.keys(facts.names)).toContain("Pool Lane Task");

  const rawXml = await fetchRawBpmn(request, auth.headers, fixtureB.sessionId);
  writeEvidence("e2e-pool-lane-raw.xml", rawXml);
  expect(rawXml).toContain("Pool Lane Task");

  await page.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-pool-lane-canvas.png") });
  expectNoRawIsGeneric(raw, `${applyToast} ${slotText}`);
});

test("4: #995 regression — annotation association round-trip остаётся зелёным", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateName = `Assoc Matrix Pack ${runId.slice(-6)}`;
  const raw = trackRawErrors(page);
  const auth = await apiLogin(request, { apiBase: API_BASE });

  const fixtureA = await createFixture(request, runId, auth.headers);
  const fixtureB = await createFixture(request, `${runId}_B`, auth.headers);

  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  await openDiagramSession(page, fixtureA);

  const created = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const selection = modeler.get("selection");
      const anchor = registry.get("Task_1")
        || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")));
      if (!anchor) return { ok: false, error: "anchor_missing" };
      const root = anchor.parent;
      const task = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(anchor.x || 0) + 380, y: Number(anchor.y || 0) + 220 },
        root,
      );
      modeling.updateLabel(task, "Matrix Task A");
      const annotation = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:TextAnnotation" }),
        { x: Number(task.x || 0) + 40, y: Number(task.y || 0) - 160 },
        root,
      );
      modeling.updateLabel(annotation, "Matrix Note A");
      const assoc = modeling.connect(annotation, task, { type: "bpmn:Association" });
      selection.select([task, annotation, assoc]);
      return { ok: true, taskId: task.id, annotationId: annotation.id, assocId: assoc?.id || "" };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(created.ok, JSON.stringify(created)).toBeTruthy();

  const { id: templateId, scope } = await captureTemplateViaUi(page, templateName);

  await openSessionInTopbar(page, fixtureB);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await applyTemplateViaUi(page, templateId, scope);
  await placeFragmentOnCanvas(page, fixtureB.sessionId);

  await page.reload();
  await waitForDiagramReady(page);
  const facts = await readXmlFacts(page);
  expect(facts.ok, JSON.stringify(facts)).toBeTruthy();
  writeEvidence("e2e-assoc-matrix-post-reload.xml", facts.xml);

  // Ровно 1 association, refs непустые и существуют в XML; текст аннотации сохранился.
  expect(facts.assocs).toHaveLength(1);
  expect(facts.assocs[0].sourceRef).not.toBe("");
  expect(facts.assocs[0].targetRef).not.toBe("");
  expect(facts.ids).toContain(facts.assocs[0].sourceRef);
  expect(facts.ids).toContain(facts.assocs[0].targetRef);
  expect(facts.xml).toContain("Matrix Note A");
  expect(Object.keys(facts.names)).toContain("Matrix Task A");

  const rawXml = await fetchRawBpmn(request, auth.headers, fixtureB.sessionId);
  writeEvidence("e2e-assoc-matrix-raw.xml", rawXml);
  expect(rawXml).toContain("association");
  expect(rawXml).toContain("Matrix Note A");

  await page.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-assoc-matrix-canvas.png") });
  expectNoRawIsGeneric(raw, await toastText(page));
});

// Сценарий 5 (stage org ≠ default, owner credentials) — Task 11, вне этого контура.
