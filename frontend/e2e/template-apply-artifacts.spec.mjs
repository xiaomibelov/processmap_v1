import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { createFixture, API_BASE, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = process.env.E2E_EVIDENCE_DIR
  || path.resolve(SPEC_DIR, "../../../../../../.planning/contours/fix/template-apply-artifacts/evidence");

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

// Создаёт фрагмент: 2 таска (Δ = 340,170), 2 TextAnnotation с текстом,
// 2 Association (annotation -> task, task -> annotation). Все 6 выделяются.
async function createAssociationFragment(page, names) {
  const result = await page.evaluate(({ taskA, taskB, textA, textB }) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const selection = modeler.get("selection");
      const anchor = registry.get("Task_1")
        || registry.get("Task_1_1")
        || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")));
      if (!anchor) return { ok: false, error: "anchor_missing" };
      const root = anchor.parent;

      const t1 = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(anchor.x || 0) + 360, y: Number(anchor.y || 0) + 220 },
        root,
      );
      const t2 = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(t1.x || 0) + 700, y: Number(t1.y || 0) + 400 },
        root,
      );
      // Точная геометрия: createShape проходит grid-snapping, поэтому
      // выставляем Δ=340,170 явным move (moveShape принимает delta) и меряем
      // фактический результат.
      modeling.moveShape(t2, {
        x: (Math.round(Number(t1.x || 0)) + 340) - Math.round(Number(t2.x || 0)),
        y: (Math.round(Number(t1.y || 0)) + 170) - Math.round(Number(t2.y || 0)),
      });
      modeling.updateLabel(t1, taskA);
      modeling.updateLabel(t2, taskB);

      const a1 = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:TextAnnotation" }),
        { x: Number(t1.x || 0) + 30, y: Number(t1.y || 0) - 170 },
        root,
      );
      const a2 = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:TextAnnotation" }),
        { x: Number(a1.x || 0) + 340, y: Number(a1.y || 0) + 170 },
        root,
      );
      modeling.updateLabel(a1, textA);
      modeling.updateLabel(a2, textB);

      const c1 = modeling.connect(a1, t1, { type: "bpmn:Association" });
      const c2 = modeling.connect(t2, a2, { type: "bpmn:Association" });

      selection.select([t1, t2, a1, a2, c1, c2]);
      return {
        ok: true,
        delta: { x: Math.round(Number(t2.x) - Number(t1.x)), y: Math.round(Number(t2.y) - Number(t1.y)) },
        t1: { id: t1.id, x: t1.x, y: t1.y },
        t2: { id: t2.id, x: t2.x, y: t2.y },
        a1Text: String(a1.businessObject?.text || ""),
        a2Text: String(a2.businessObject?.text || ""),
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, names);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return result;
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

// Открывает пикер шаблонов, выбирает строку и жмёт «Применить в сессию»,
// затем кликает по канвасу для placement.
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
  // Фиксируем текст тоста до возможной отмены placement (Esc ниже).
  await page.waitForTimeout(400);
  // Workaround для известного product-дефекта (вне контура): ghost может
  // остаться видимым из-за churn placement-эффекта; Esc заменит warning-тост
  // info-тостом об отмене — текст уже захвачен выше.
  const toastText = await page.evaluate(() => {
    const vp = document.querySelector("[data-testid='process-toast-viewport']");
    return vp ? String(vp.textContent || "") : "";
  });
  if (await page.getByTestId("bpmn-fragment-ghost").isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
  }
  return toastText;
}

// Факты из saveXML моделера: associations (refs), id-set, тексты аннотаций.
async function readXmlFacts(page) {
  return page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const { xml } = await modeler.saveXML({ format: true });
    const doc = new DOMParser().parseFromString(String(xml || ""), "text/xml");
    const byTag = (tag) => Array.from(doc.getElementsByTagNameNS("*", tag));
    const assocs = byTag("association").map((el) => ({
      id: el.getAttribute("id") || "",
      sourceRef: el.getAttribute("sourceRef") || "",
      targetRef: el.getAttribute("targetRef") || "",
    }));
    const idSet = new Set();
    Array.from(doc.getElementsByTagNameNS("*", "*")).forEach((node) => {
      const id = node.getAttribute && node.getAttribute("id");
      if (id) idSet.add(id);
    });
    const texts = byTag("text").map((el) => String(el.textContent || "").trim());
    const names = {};
    byTag("task").forEach((el) => {
      const name = String(el.getAttribute("name") || "").trim();
      if (name) names[name] = el.getAttribute("id") || "";
    });
    return { ok: true, xml: String(xml || ""), assocs, ids: Array.from(idSet), texts, names };
  });
}

async function findTaskPositions(page, nameA, nameB) {
  return page.evaluate(({ a, b }) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const registry = modeler.get("elementRegistry");
    const find = (name) => {
      const el = (registry.getAll() || []).find((item) => (
        /task$/i.test(String(item?.type || ""))
        && String(item?.businessObject?.name || "").trim() === name
      ));
      return el ? { id: el.id, x: Number(el.x), y: Number(el.y) } : null;
    };
    return { ok: true, a: find(a), b: find(b) };
  }, { a: nameA, b: nameB });
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

const TASK_A = "Операция A";
const TASK_B = "Операция B";
const TEXT_A = "Первая операция";
const TEXT_B = "Вторая операция";

test("A: association round-trip — capture pack с TextAnnotation+Association, apply в другую сессию, F5 persistence", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateName = `Assoc Pack ${runId.slice(-6)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });

  const fixtureA = await createFixture(request, runId, auth.headers);
  const fixtureB = await createFixture(request, `${runId}_B`, auth.headers);

  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  await openDiagramSession(page, fixtureA);

  const fragment = await createAssociationFragment(page, {
    taskA: TASK_A, taskB: TASK_B, textA: TEXT_A, textB: TEXT_B,
  });
  expect(fragment.a1Text).toBe(TEXT_A);
  expect(fragment.a2Text).toBe(TEXT_B);
  expect(fragment.delta).toEqual({ x: 340, y: 170 });

  const { id: templateId, scope } = await captureTemplateViaUi(page, templateName);

  // Сессия B: apply через пикер + placement.
  await openSessionInTopbar(page, fixtureB);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);
  await applyTemplateViaUi(page, templateId, scope);
  await placeFragmentOnCanvas(page, fixtureB.sessionId);

  const facts = await readXmlFacts(page);
  expect(facts.ok, JSON.stringify(facts)).toBeTruthy();

  writeEvidence("e2e-post-apply-A.xml", facts.xml);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-canvas-association.png") });

  // Ровно 2 association, refs непустые и существуют в XML.
  expect(facts.assocs).toHaveLength(2);
  for (const assoc of facts.assocs) {
    expect(assoc.sourceRef).not.toBe("");
    expect(assoc.targetRef).not.toBe("");
    expect(facts.ids).toContain(assoc.sourceRef);
    expect(facts.ids).toContain(assoc.targetRef);
  }
  // Тексты аннотаций перенесены.
  expect(facts.texts).toContain(TEXT_A);
  expect(facts.texts).toContain(TEXT_B);
  // Имена задач перенесены.
  expect(Object.keys(facts.names)).toContain(TASK_A);
  expect(Object.keys(facts.names)).toContain(TASK_B);

  // Относительная геометрия сохранена (Δ исходного фрагмента = 340,170).
  const pos = await findTaskPositions(page, TASK_A, TASK_B);
  expect(pos.ok, JSON.stringify(pos)).toBeTruthy();
  expect(pos.a, `task ${TASK_A} not found`).toBeTruthy();
  expect(pos.b, `task ${TASK_B} not found`).toBeTruthy();
  const dx = Math.abs((pos.b.x - pos.a.x) - fragment.delta.x);
  const dy = Math.abs((pos.b.y - pos.a.y) - fragment.delta.y);
  expect(dx).toBeLessThanOrEqual(2);
  expect(dy).toBeLessThanOrEqual(2);

  // Persisted: raw XML на сервере содержит association и тексты.
  const rawXml = await fetchRawBpmn(request, auth.headers, fixtureB.sessionId);
  writeEvidence("e2e-post-apply-B.xml", rawXml);
  expect(rawXml).toContain("association");
  expect(rawXml).toContain(TEXT_A);
  expect(rawXml).toContain(TEXT_B);

  // F5: после перезагрузки фрагмент целиком.
  await page.reload();
  await waitForDiagramReady(page);
  const factsAfterReload = await readXmlFacts(page);
  expect(factsAfterReload.ok, JSON.stringify(factsAfterReload)).toBeTruthy();
  writeEvidence("e2e-post-reload.xml", factsAfterReload.xml);
  expect(factsAfterReload.assocs).toHaveLength(2);
  expect(factsAfterReload.texts).toContain(TEXT_A);
  expect(factsAfterReload.texts).toContain(TEXT_B);
});

test("B: legacy-warning — apply pack с TextAnnotation без custom.text показывает warning-тост", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateName = `Legacy Pack ${runId.slice(-6)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });

  // Legacy pack: TextAnnotation-нода БЕЗ semanticPayload.custom.text.
  const payload = buildPack({
    title: templateName,
    nodes: [
      makeNode("TPL_L_T1", "bpmn:Task", "Legacy task", 400, 300),
      makeNode("TPL_L_A1", "bpmn:TextAnnotation", "", 400, 120, 100, 80, {}),
    ],
    edges: [makeEdge("TPL_L_ASS1", "bpmn:Association", "TPL_L_A1", "TPL_L_T1")],
    entryNodeId: "TPL_L_T1",
    exitNodeId: "TPL_L_T1",
  });
  const templateId = await createTemplateViaApi(request, auth.headers, templateName, payload);

  const fixture = await createFixture(request, runId, auth.headers);
  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  await openDiagramSession(page, fixture);

  await applyTemplateViaUi(page, templateId, "personal");
  const toastAfterInsert = await placeFragmentOnCanvas(page, fixture.sessionId);

  const viewport = page.getByTestId("process-toast-viewport");
  const liveToast = await viewport.isVisible().catch(() => false)
    ? await viewport.textContent().catch(() => "")
    : "";
  expect(`${toastAfterInsert} ${liveToast}`).toMatch(/старая версии|Пересоздайте/);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-legacy-warning-toast.png") });
});

test("C: capture-warning — выделение с BoundaryEvent даёт явное предупреждение вместо silent-drop", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(request, runId, auth.headers);

  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  await openDiagramSession(page, fixture);

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
      const host = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(anchor.x || 0) + 300, y: Number(anchor.y || 0) + 160 },
        anchor.parent,
      );
      modeling.updateLabel(host, "Host with boundary");
      const boundary = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:BoundaryEvent" }),
        { x: Number(host.x || 0) + 30, y: Number(host.y || 0) + Number(host.height || 80) },
        host,
        { attach: true },
      );
      selection.select([host, boundary]);
      return { ok: true, boundaryId: String(boundary.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  });
  expect(created.ok, JSON.stringify(created)).toBeTruthy();

  // Capture через UI: BoundaryEvent не должен попасть в pack молча.
  const overflowToggle = page.getByTestId("diagram-toolbar-overflow-toggle");
  await overflowToggle.click();
  await page.getByTestId("diagram-add-template").click();
  await expect(page.getByTestId("modal-create-template")).toBeVisible();
  await page.getByTestId("input-template-name").fill(`Boundary Pack ${runId.slice(-6)}`);
  await page.getByTestId("btn-save-template").click();

  // Явное предупреждение во viewport тостов (не warning-tone success-ветка,
  // а error-tone из buildBpmnFragmentTemplate: unsupported_fragment_nodes).
  const viewport = page.getByTestId("process-toast-viewport");
  await expect(viewport).toContainText(/неподдерживаемые BPMN типы/i, { timeout: 10000 });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-capture-warning-toast.png") });
});

test("D: regression — apply простого pack (2 таска + sequence flow) без предупреждений", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateName = `Regression Pack ${runId.slice(-6)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });

  const payload = buildPack({
    title: templateName,
    nodes: [
      makeNode("TPL_R_T1", "bpmn:Task", "Regression A", 400, 300),
      makeNode("TPL_R_T2", "bpmn:Task", "Regression B", 700, 300),
    ],
    edges: [makeEdge("TPL_R_F1", "bpmn:SequenceFlow", "TPL_R_T1", "TPL_R_T2")],
    entryNodeId: "TPL_R_T1",
    exitNodeId: "TPL_R_T2",
  });
  const templateId = await createTemplateViaApi(request, auth.headers, templateName, payload);

  const fixture = await createFixture(request, runId, auth.headers);
  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
  await openDiagramSession(page, fixture);

  await applyTemplateViaUi(page, templateId, "personal");
  await placeFragmentOnCanvas(page, fixture.sessionId);

  const facts = await readXmlFacts(page);
  expect(facts.ok, JSON.stringify(facts)).toBeTruthy();
  // Shape'ы и поток вставились.
  expect(Object.keys(facts.names)).toContain("Regression A");
  expect(Object.keys(facts.names)).toContain("Regression B");
  const flows = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler?.get?.("elementRegistry");
    return (registry?.getAll?.() || [])
      .filter((el) => /sequenceflow$/i.test(String(el?.type || "")))
      .map((el) => ({
        id: el.id,
        sourceName: String(el?.source?.businessObject?.name || ""),
        targetName: String(el?.target?.businessObject?.name || ""),
      }));
  });
  const insertedFlow = flows.find((f) => f.sourceName === "Regression A" && f.targetName === "Regression B");
  expect(insertedFlow, JSON.stringify(flows)).toBeTruthy();
  // Предупреждений нет (viewport рендерится только при активном тосте).
  const viewport = page.getByTestId("process-toast-viewport");
  if (await viewport.isVisible().catch(() => false)) {
    await expect(viewport).not.toContainText(/старая версии|Вставлено не полностью/);
  }
});
