// E2E-спека feature/tobe-overlay-visibility-provenance-v1 (T12) — provenance-
// подсветка TO BE overlay (прямая T9, обратная T10, empty-state T11, persist
// после reload, off-флаг, mid-flight) + семантика бейджа N→1 (часть 0, T12):
//   1. Прямая: клик по op_consolidated (derived_from [a1,a2,a3], N→1) → ровно
//      3 ghost-маркера tobeProvAncestor (a1,a2,a3; НЕ a4/a5) + provenance-dim
//      на ghost-контейнере; клик в пустоту TO BE → снято.
//   2. Обратная (R1): pan+zoom → стабилизация sync → клик по зоне ghost-a1
//      (пустой на TO BE) → op_consolidated маркером tobeProvLinked + бейдж
//      «3 задачи AS IS → 1 операция» (кардинальность ОПЕРАЦИИ, часть 0) +
//      ghost-a1 в tobeProvAncestor; второй клик в пустоту → снято.
//   3. 0 мутаций (hard-assert): sha256 bpmn_xml + версии to_be до/после
//      сценариев 1–2 неизменны; whitelist-детектор — как в T5-fix (POST/
//      PUT/PATCH/DELETE hard-fail, presence + note-aggregates исключения, AS IS
//      строго raw=1&include_overlay=0, to_be read-noise терпим, /meta разрешён).
//   4. Save/reload: штатное сохранение (кнопка diagram-toolbar-save) → строгий
//      page.reload() → клик по op_consolidated → подсветка восстановлена
//      (регресс-якорь «баг F5»: индекс пересобирается из персистнутого XML).
//   5. Empty-state: вторая to_be-пара БЕЗ pm:Trace → первый selection → hint
//      (tobe-prov-empty-hint) ровно один раз; второй selection → не
//      дублируется; dismiss (tobe-prov-empty-dismiss) → скрыт.
//   6. Off-флаг: tobe_overlay_underlay=false → reload → клики: ни маркеров,
//      ни бейджа, ни hint в DOM.
//   7. Mid-flight: уход на as_is-сессию → linked-маркеры/badge отсутствуют;
//      возврат на to_be → прямая подсветка работает; ровно 1 fetch
//      GET sessions/{toBeId}/meta на визит (delta network count).
// Фикстура: AS IS a1..a4 (связанные) + a5 (несвязанный), TO BE op_consolidated
// (N→1 из a1,a2,a3), op_simple (1→1 из a4), op_new (без provenance); TO BE XML
// с pm:Trace генерируется helper'ом embedProvenanceIntoBpmnXml (lowercase
// pm:trace руками не парсится moddle — бриф). Геометрия фиксированная и
// РАЗВЕДЁННАЯ: AS IS-элементы в x≈200/600, TO BE в x≈1000 — зона ghost-a1
// пуста на TO BE, клик туда идёт в обратный сценарий (не в selection).
// DOM-контракт маркеров (diagram-js addMarker): класс на g.djs-element с
// data-element-id (подтверждено CSS трека: .tobeOverlayUnderlay-canvas
// .djs-element.tobeProvAncestor .djs-visual > …). Бейдж — span.tobeProvBadge
// в .djs-overlays editor-слоя.
// Требует живого стека (E2E_APP_BASE_URL / E2E_API_BASE_URL).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, openFixture } from "./helpers/processFixture.mjs";
import { embedProvenanceIntoBpmnXml } from "../src/features/technologist/workspace/tobeProvenance.js";

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.resolve(SPEC_DIR, "../../artifacts/tobe-provenance");

const RUN_ID = `tobe_prov_${Date.now()}`;

// --- Фиксированная геометрия фикстуры (см. шапку) ---
const ASIS_POS = {
  a1: { x: 200, y: 200 },
  a2: { x: 200, y: 400 },
  a3: { x: 200, y: 600 },
  a4: { x: 620, y: 200 },
  a5: { x: 620, y: 420 },
};
const TOBE_POS = {
  op_consolidated: { x: 1000, y: 200 },
  op_simple: { x: 1000, y: 400 },
  op_new: { x: 1000, y: 600 },
};

function taskXml(id, name, pos) {
  return `
    <bpmn:userTask id="${id}" name="${name}">
      <bpmn:incoming>${id}_F_in</bpmn:incoming>
      <bpmn:outgoing>${id}_F_out</bpmn:outgoing>
    </bpmn:userTask>`;
}

function taskDiXml(id, pos) {
  return `
      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}">
        <dc:Bounds x="${pos.x}" y="${pos.y}" width="180" height="80" />
      </bpmndi:BPMNShape>`;
}

// Единый каркас процесса: start → chain tasks → end; задачи на фиксированных
// позициях. kind: "asis" (a1..a5) | "tobe" (op_*).
function fixtureXml(kind) {
  const tasks = kind === "asis"
    ? Object.entries(ASIS_POS).map(([id, pos]) => ({ id, name: `AS IS ${id}`, pos }))
    : Object.entries(TOBE_POS).map(([id, pos]) => ({ id, name: String(id), pos }));
  const taskIds = tasks.map((t) => t.id);
  const flows = [];
  let prev = "Start_evt";
  for (const id of taskIds) {
    flows.push(`<bpmn:sequenceFlow id="F_${prev}_${id}" sourceRef="${prev}" targetRef="${id}" />`);
    prev = id;
  }
  flows.push(`<bpmn:sequenceFlow id="F_${prev}_End_evt" sourceRef="${prev}" targetRef="End_evt" />`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_${kind}_${RUN_ID}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_${kind}_${RUN_ID}" name="T12 ${kind}" isExecutable="false">
    <bpmn:startEvent id="Start_evt"><bpmn:outgoing>F_Start_evt_${taskIds[0]}</bpmn:outgoing></bpmn:startEvent>
    ${tasks.map((t) => taskXml(t.id, t.name, t.pos)).join("\n    ")}
    <bpmn:endEvent id="End_evt"><bpmn:incoming>F_${taskIds[taskIds.length - 1]}_End_evt</bpmn:incoming></bpmn:endEvent>
    ${flows.join("\n    ")}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Dia_${kind}_${RUN_ID}">
    <bpmndi:BPMNPlane id="Plane_${kind}_${RUN_ID}" bpmnElement="Process_${kind}_${RUN_ID}">
      <bpmndi:BPMNShape id="Start_evt_di" bpmnElement="Start_evt">
        <dc:Bounds x="96" y="412" width="36" height="36" />
      </bpmndi:BPMNShape>
      ${tasks.map((t) => taskDiXml(t.id, t.pos)).join("\n")}
      <bpmndi:BPMNShape id="End_evt_di" bpmnElement="End_evt">
        <dc:Bounds x="1256" y="412" width="36" height="36" />
      </bpmndi:BPMNShape>
      ${taskIds.map((id, i) => {
        const src = i === 0 ? { x: 132, y: 430 } : ASIS_OR_TOBE(kind, taskIds[i - 1]);
        const dst = ASIS_OR_TOBE(kind, id);
        return `<bpmndi:BPMNEdge id="F_${i === 0 ? "Start_evt" : taskIds[i - 1]}_${id}_di" bpmnElement="F_${i === 0 ? "Start_evt" : taskIds[i - 1]}_${id}"><di:waypoint x="${src.x + (i === 0 ? 0 : 180)}" y="${src.y + 40}" /><di:waypoint x="${dst.x}" y="${dst.y + 40}" /></bpmndi:BPMNEdge>`;
      }).join("\n      ")}
      <bpmndi:BPMNEdge id="F_${taskIds[taskIds.length - 1]}_End_evt_di" bpmnElement="F_${taskIds[taskIds.length - 1]}_End_evt">
        <di:waypoint x="${(kind === "asis" ? ASIS_POS : TOBE_POS)[taskIds[taskIds.length - 1]].x + 180}" y="${(kind === "asis" ? ASIS_POS : TOBE_POS)[taskIds[taskIds.length - 1]].y + 40}" />
        <di:waypoint x="1256" y="430" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function ASIS_OR_TOBE(kind, id) {
  return (kind === "asis" ? ASIS_POS : TOBE_POS)[id] || { x: 96, y: 412 };
}

// trace_map-формат helper'а: element_id = AS IS, draft_node_ids = TO BE.
function traceMapForFixture() {
  return [
    { element_id: "a1", draft_node_ids: ["op_consolidated"], fate: "transformed_to", rule_id: "R_cons" },
    { element_id: "a2", draft_node_ids: ["op_consolidated"], fate: "transformed_to", rule_id: "R_cons" },
    { element_id: "a3", draft_node_ids: ["op_consolidated"], fate: "transformed_to", rule_id: "R_cons" },
    { element_id: "a4", draft_node_ids: ["op_simple"], fate: "transformed_to", rule_id: "R_move" },
  ];
}

async function setFlag(request, auth, key, value) {
  const res = await request.patch(`${API_BASE}/api/admin/feature-flags`, {
    headers: auth.headers,
    data: { flags: { [key]: value } },
  });
  expect(res.ok(), `set ${key}=${value}: ${res.status()}`).toBeTruthy();
}

async function createQuickSession(request, headers, projectId, title, extra = undefined) {
  const res = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    { headers, data: { title, roles: ["Оператор"], start_role: "Оператор", ...(extra || {}) } },
  );
  const body = await apiJson(res, `create session ${title}`);
  const sessionId = String(body.id || body.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return sessionId;
}

async function putBpmn(request, headers, sessionId, xml) {
  // Save-путь стека после миграции БД на head отвечает ~60с (концерн T12:
  // см. отчёт) — дефолтный request-timeout 30с не дождался бы ответа.
  const res = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers,
    data: { xml, base_diagram_state_version: 0, base_bpmn_xml_version: 0 },
    timeout: 180_000,
  });
  await apiJson(res, `seed bpmn ${sessionId}`);
}

async function getSessionRecord(request, headers, sessionId) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, { headers });
  const body = await apiJson(res, `get session ${sessionId}`);
  return body && typeof body === "object" ? body : {};
}

async function createLinkedToBeSession(request, headers, projectId, title, asIsSid) {
  const sid = await createQuickSession(request, headers, projectId, title, {
    process_layer: "to_be",
    derived_from_session_id: asIsSid,
  });
  let record = await getSessionRecord(request, headers, sid);
  if (String(record.process_layer || "") !== "to_be"
    || String(record.derived_from_session_id || "") !== asIsSid) {
    const patchRes = await request.patch(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}`, {
      headers,
      data: { process_layer: "to_be", derived_from_session_id: asIsSid },
    });
    await apiJson(patchRes, `patch to_be link ${sid}`);
    record = await getSessionRecord(request, headers, sid);
  }
  expect(String(record.process_layer || ""), `${title}: process_layer`).toBe("to_be");
  expect(String(record.derived_from_session_id || ""), `${title}: derived_from_session_id`).toBe(asIsSid);
  return sid;
}

async function readServerState(request, headers, sessionId) {
  const record = await getSessionRecord(request, headers, sessionId);
  const bpmnRes = await request.get(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn?raw=1&include_overlay=0`,
    { headers },
  );
  const xmlText = await bpmnRes.text();
  expect(bpmnRes.ok(), `read bpmn ${sessionId}: ${bpmnRes.status()}`).toBeTruthy();
  const { createHash } = await import("node:crypto");
  return {
    diagramStateVersion: Number(record.diagram_state_version || 0),
    bpmnXmlVersion: Number(record.bpmn_xml_version || 0),
    sha256: createHash("sha256").update(String(xmlText || "")).digest("hex"),
  };
}

async function clickSchemaTabIfPresent(page) {
  const schemaTab = page.getByRole("tab", { name: /Схема/i }).first();
  for (let i = 0; i < 12; i += 1) {
    if (await schemaTab.isVisible().catch(() => false)) {
      await schemaTab.click();
      return;
    }
    await page.waitForTimeout(500);
  }
}

// Строгое ожидание готовности стадии (sentinel diagram-ready = loadState
// ready/canvas-ready). Слабый waitForDiagramReady пропускает на создании
// modeler'а ДО importXML (гонка T5: stage застревает в importing).
async function waitStageReady(page, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page
      .evaluate(() => !!document.querySelector("[data-testid='diagram-ready']"))
      .catch(() => false);
    if (ready) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

// Boot linked to_be: org-chooser → вкладка «Схема» → strict ready. При
// зависании stage в importing — один полный reload (чистый remount, T5 R1).
async function bootLinkedToBe(page, projectId, toBeId, options = {}) {
  const navigate = options?.navigate !== false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (navigate || attempt > 0) {
      await openFixture(page, { projectId, sessionId: toBeId });
    }
    const chooser = page.getByText("Выберите организацию").first();
    for (let i = 0; i < 40; i += 1) {
      if (await chooser.isVisible().catch(() => false)) {
        await page.getByRole("button", { name: /Default/i }).first().click();
        break;
      }
      if (await page.getByRole("tab", { name: /Схема/i }).first().isVisible().catch(() => false)) break;
      if (await page.locator(".bpmnStageHost").isVisible().catch(() => false)) break;
      await page.waitForTimeout(500);
    }
    await clickSchemaTabIfPresent(page);
    if (await waitStageReady(page)) return;
  }
  throw new Error("diagram-ready не достигнут: стадия зависла в importing после reload-retry");
}

// SPA-переход на сессию через e2e-хук (mid-flight; прецедент референса).
async function openSessionViaHook(page, sessionId) {
  let last;
  let ok = false;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && !ok) {
    last = await page
      .evaluate(async (sid) => {
        const opener = window?.__FPC_E2E_OPEN_SESSION__;
        if (typeof opener !== "function") return { ok: false, error: "no_e2e_opener" };
        return opener(sid);
      }, sessionId)
      .catch((e) => ({ ok: false, error: String(e?.message || e).slice(0, 160) }));
    ok = last?.ok === true;
    if (!ok) await page.waitForTimeout(500);
  }
  expect(ok, `openSession ${sessionId} через e2e-хук; last=${JSON.stringify(last)}`).toBe(true);
  await clickSchemaTabIfPresent(page);
}

// bpmn-js 18: viewport-группа — g.viewport; отсутствие transform == identity.
function parseViewportMatrix(transform) {
  if (!transform) return { scale: 1, x: 0, y: 0 };
  const m = /matrix\(([^)]+)/.exec(String(transform || ""));
  if (!m) return { scale: 1, x: 0, y: 0 };
  const n = m[1].split(/[,\s]+/).filter(Boolean).map(Number);
  return { scale: n[0], x: n[4], y: n[5] };
}

function viewportsAligned(a, b) {
  const pa = parseViewportMatrix(a);
  const pb = parseViewportMatrix(b);
  return Math.abs(pa.scale - pb.scale) < 0.001
    && Math.abs(pa.x - pb.x) < 1
    && Math.abs(pa.y - pb.y) < 1;
}

async function readViewportTransform(page, layerSelector) {
  return page.evaluate((sel) => {
    const viewport = document.querySelector(`${sel} g.viewport`);
    return viewport ? String(viewport.getAttribute("transform") || "") : null;
  }, layerSelector);
}

// Селекторы слоёв/маркеров (DOM-контракт diagram-js addMarker + CSS трека).
const GHOST_LAYER = ".bpmnLayer--underlayAsis";
const GHOST_CANVAS = `${GHOST_LAYER} .tobeOverlayUnderlay-canvas`;
const ANCESTOR = `${GHOST_LAYER} .djs-element.tobeProvAncestor`;
const BADGE = ".tobeProvBadge";

async function editorLayerSel(page) {
  return page.evaluate(() => (
    document.querySelector(".bpmnLayer--editor g.viewport")
      ? ".bpmnLayer--editor"
      : ".bpmnLayer--diagram"
  ));
}

// Клик по центру элемента слоя (viewport-координаты через boundingBox).
async function clickElementCenter(page, layerSel, elementId) {
  const box = await page.locator(`${layerSel} [data-element-id="${elementId}"]`).first().boundingBox();
  expect(box, `bbox ${layerSel} [data-element-id=${elementId}]`).toBeTruthy();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
}

// Клик в угол стадии — «пустоту» (вне фигур AS IS/TO BE; даже при попадании
// по несвязанному ghost-элементу оба сценария подсветки гасят прежнее).
async function clickStageCorner(page) {
  const box = await page.locator(".bpmnStack").boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box.x + 24, box.y + box.height - 24);
  await page.waitForTimeout(300);
}

// Клик по элементу с повтором до появления ожидаемого числа ancestor-
// маркеров: provenance-индекс гидрируется ЛЕНИВО (requestIdleCallback + fetch,
// T8), контроллер подсветки инициализируется при status "ready" — ранний
// клик до гидратации молча теряется (selection.changed без слушателя).
// Реалистичный retry: клик в пустоту (снять selection) → клик по элементу.
async function clickUntilAncestors(page, editorSel, elementId, count, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    await clickElementCenter(page, editorSel, elementId);
    try {
      await page.waitForFunction(
        ({ sel, n }) => document.querySelectorAll(sel).length === n,
        { sel: `${GHOST_LAYER} .djs-element.tobeProvAncestor`, n: count },
        { timeout: 3500 },
      );
      return;
    } catch {
      // контроллер ещё не готов — снимаем selection и повторяем
      await clickStageCorner(page);
    }
  }
  throw new Error(`${elementId}: ancestor-маркеры (${count}) не появились после ${attempts} попыток`);
}

// Клик по зоне ghost-элемента (обратная подсветка) с повтором до появления
// linked-маркера: те же причины ленивой гидратации, что у прямого сценария.
async function clickGhostZoneUntilLinked(page, editorSel, ghostElementId, linkedElementId, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const box = await page.locator(`${GHOST_LAYER} [data-element-id="${ghostElementId}"]`).first().boundingBox();
    expect(box, `bbox ghost ${ghostElementId}`).toBeTruthy();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    const linked = await page.locator(`${editorSel} [data-element-id="${linkedElementId}"]`).first()
      .evaluate((el) => el.classList.contains("tobeProvLinked")).catch(() => false);
    if (linked) return;
    await clickStageCorner(page);
  }
  throw new Error(`ghost ${ghostElementId}: linked-маркер на ${linkedElementId} не появился после ${attempts} попыток`);
}

// Клик по TO BE-элементу с повтором до появления empty-hint (T11-listener
// вешается при status "empty"; ранний клик до гидратации молча теряется).
async function clickUntilEmptyHint(page, editorSel, elementId, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    await clickElementCenter(page, editorSel, elementId);
    try {
      await page.waitForFunction(
        () => !!document.querySelector("[data-testid='tobe-prov-empty-hint']"),
        undefined,
        { timeout: 3500 },
      );
      return;
    } catch {
      await clickStageCorner(page);
    }
  }
  throw new Error(`${elementId}: empty-hint не появился после ${attempts} попыток`);
}

async function saveScreenshot(page, name) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const file = path.join(ARTIFACTS_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

test.describe("tobe-overlay-provenance (T12)", () => {
  let auth;
  let pairA; // TO BE с pm:Trace
  let pairB; // TO BE без provenance (empty-state)
  let asIsXmlText;
  let toBeXmlProv;

  test.beforeAll(async ({ request }) => {
    // Бюджет самого хука (documented pattern: setTimeout внутри beforeAll
    // меняет timeout хука): 4 seed-PUT bpmn × ~60с save-путь + фикстура.
    test.setTimeout(420_000);
    auth = await apiLogin(request, { apiBase: API_BASE });
    await setFlag(request, auth, "tobe_overlay_underlay", true);
    await setFlag(request, auth, "tobe_overlay_mock", false);

    asIsXmlText = fixtureXml("asis");
    const toBeBase = fixtureXml("tobe");
    toBeXmlProv = await embedProvenanceIntoBpmnXml(toBeBase, traceMapForFixture());
    expect(toBeXmlProv).toContain("pm:Trace");

    // Пара A: AS IS + linked TO BE (XML с pm:Trace).
    const projectRes = await request.post(`${API_BASE}/api/projects`, {
      headers: auth.headers,
      data: { title: `E2E tobe provenance ${RUN_ID}`, passport: {} },
    });
    const project = await apiJson(projectRes, "create project A");
    const projectId = String(project.id || project.project_id || "").trim();
    const orgId = String(project.org_id || project.orgId || project.organization_id || "").trim();
    expect(projectId).not.toBe("");

    const asIsA = await createQuickSession(request, auth.headers, projectId, `AS IS A ${RUN_ID}`);
    await putBpmn(request, auth.headers, asIsA, asIsXmlText);
    const toBeA = await createLinkedToBeSession(request, auth.headers, projectId, `TO BE A ${RUN_ID}`, asIsA);
    await putBpmn(request, auth.headers, toBeA, toBeXmlProv);

    // Пара B (отдельный проект): AS IS + linked TO BE БЕЗ provenance.
    const projectBRes = await request.post(`${API_BASE}/api/projects`, {
      headers: auth.headers,
      data: { title: `E2E tobe provenance empty ${RUN_ID}`, passport: {} },
    });
    const projectB = await apiJson(projectBRes, "create project B");
    const projectBId = String(projectB.id || projectB.project_id || "").trim();
    const orgBId = String(projectB.org_id || projectB.orgId || projectB.organization_id || "").trim();
    expect(projectBId).not.toBe("");
    const asIsB = await createQuickSession(request, auth.headers, projectBId, `AS IS B ${RUN_ID}`);
    await putBpmn(request, auth.headers, asIsB, asIsXmlText);
    const toBeB = await createLinkedToBeSession(request, auth.headers, projectBId, `TO BE B ${RUN_ID}`, asIsB);
    await putBpmn(request, auth.headers, toBeB, toBeBase);

    pairA = { projectId, orgId, asIs: asIsA, toBe: toBeA };
    pairB = { projectId: projectBId, orgId: orgBId, asIs: asIsB, toBe: toBeB };
  });

  test.afterAll(async ({ request }) => {
    // Дефенсивно: beforeAll мог упасть до установки auth — флаг не восстанем,
    // но и не усугубим крешом хука.
    if (auth) await setFlag(request, auth, "tobe_overlay_underlay", true);
  });

  test("прямая + обратная подсветка, бейдж N→1 (кардинальность операции), 0 мутаций", async ({ page, request }) => {
    const { projectId, orgId, asIs, toBe } = pairA;

    // --- Сетевые инварианты (whitelist-read #1034 + T5-fix, POST включён) ---
    const diagramMutations = [];
    const whitelistViolations = [];
    const loggedNoise = { presence: 0, foreignReads: 0, sessionReads: 0 };
    let segmentActive = false;

    page.on("request", (req) => {
      const url = req.url();
      if (!url.includes("/api/sessions/")) return;
      const method = req.method();
      const isPresence = /\/api\/sessions\/[^/?#]+\/presence/.test(url);
      const isBatchRead = /\/api\/sessions\/note-aggregates\/?(\?|#|$)/.test(url);
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !isPresence && !isBatchRead) {
        diagramMutations.push({ method, url });
        return;
      }
      if (isPresence || isBatchRead) {
        loggedNoise.presence += 1;
        return;
      }
      if (!segmentActive) return;
      const m = url.match(/\/api\/sessions\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?/);
      if (!m) return;
      const sid = decodeURIComponent(m[1]);
      const sub = m[2] || "";
      if (sid === asIs) {
        if (method === "GET" && sub === "") return;
        if (method === "GET" && sub === "/bpmn") {
          const q = new URL(url).searchParams;
          if (q.get("raw") === "1" && q.get("include_overlay") === "0") return;
          whitelistViolations.push({ kind: "asis-bpmn-params", method, url });
          return;
        }
        whitelistViolations.push({ kind: "asis-read", method, url });
        return;
      }
      if (sid === toBe) {
        loggedNoise.sessionReads += 1;
        return;
      }
      loggedNoise.foreignReads += 1;
    });

    await setUiToken(page, auth.accessToken);
    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
      window.__FPC_E2E_PAUSE_AUTOSAVE__ = true;
    });
    await page.addInitScript((value) => {
      if (value) window.localStorage.setItem("fpc_active_org_id", value);
    }, orgId);
    await bootLinkedToBe(page, projectId, toBe);

    const editorSel = await editorLayerSel(page);
    await expect(page.locator(GHOST_CANVAS)).toBeVisible({ timeout: 20000 });
    // Индекс provenance гидрируется лениво (requestIdleCallback) — ждём через
    // функциональный сигнал: прямая подсветка применилась (retry-клик).
    segmentActive = true;

    const before = await readServerState(request, auth.headers, toBe);

    // --- Сценарий 1: прямая подсветка (T9) ---
    // Индекс provenance гидрируется лениво (requestIdleCallback + fetch) —
    // клик с retry до применения (см. clickUntilAncestors).
    await clickUntilAncestors(page, editorSel, "op_consolidated", 3);
    await expect.poll(async () => page.locator(ANCESTOR).count(), {
      timeout: 5000,
      message: "ровно 3 ghost-маркера tobeProvAncestor (a1,a2,a3)",
    }).toBe(3);
    for (const id of ["a1", "a2", "a3"]) {
      await expect(
        page.locator(`${GHOST_LAYER} [data-element-id="${id}"]`).first(),
        `ghost ${id} в tobeProvAncestor`,
      ).toHaveClass(/tobeProvAncestor/, { timeout: 10000 });
    }
    for (const id of ["a4", "a5"]) {
      await expect(
        page.locator(`${GHOST_LAYER} [data-element-id="${id}"]`).first(),
        `ghost ${id} НЕ подсвечен`,
      ).not.toHaveClass(/tobeProvAncestor/);
    }
    await expect(page.locator(GHOST_CANVAS)).toHaveClass(/provenance-dim/);
    const shotForward = await saveScreenshot(page, "forward");

    // Клик в пустоту TO BE → снято.
    await clickStageCorner(page);
    await expect(page.locator(ANCESTOR)).toHaveCount(0);
    await expect(page.locator(GHOST_CANVAS)).not.toHaveClass(/provenance-dim/);

    // --- Сценарий 2: обратная подсветка (T10 + T12-бейдж) ---
    // Pan editor → sync ghost догоняет; клик по зоне ghost-a1 (пустой на TO BE).
    const stageBox = await page.locator(".bpmnStack").boundingBox();
    expect(stageBox).toBeTruthy();
    await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(stageBox.x + stageBox.width / 2 + 120, stageBox.y + stageBox.height / 2 + 60, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => {
      const g = await readViewportTransform(page, GHOST_LAYER);
      const e = await readViewportTransform(page, editorSel);
      return viewportsAligned(g, e);
    }, { timeout: 10000, message: "viewbox-sync editor → ghost после pan" }).toBeTruthy();

    // op_consolidated — tobeProvLinked; бейдж «3 задачи AS IS → 1 операция»
    // (кардинальность ОПЕРАЦИИ: 1 op → |forward.asIsIds| = 3, часть 0 T12).
    await clickGhostZoneUntilLinked(page, editorSel, "a1", "op_consolidated");
    await expect(
      page.locator(`${editorSel} [data-element-id="op_consolidated"]`).first(),
      "op_consolidated в tobeProvLinked",
    ).toHaveClass(/tobeProvLinked/, { timeout: 10000 });
    await expect(page.locator(`${GHOST_LAYER} [data-element-id="a1"]`).first())
      .toHaveClass(/tobeProvAncestor/, { timeout: 10000 });
    const badge = page.locator(BADGE).first();
    await expect(badge, "бейдж N→1").toBeVisible({ timeout: 10000 });
    await expect(badge).toHaveText("3 задачи AS IS → 1 операция");
    await expect(page.locator(`${editorSel} [data-element-id="op_new"]`).first())
      .not.toHaveClass(/tobeProvLinked/);
    const shotReverse = await saveScreenshot(page, "reverse");

    // Второй клик в пустоту → снято (маркеры, бейдж).
    await clickStageCorner(page);
    await expect(page.locator(`${editorSel} [data-element-id="op_consolidated"]`).first())
      .not.toHaveClass(/tobeProvLinked/);
    await expect(page.locator(ANCESTOR)).toHaveCount(0);
    await expect(page.locator(BADGE)).toHaveCount(0);

    // --- Сценарий 3: 0 мутаций (hard-assert) ---
    const after = await readServerState(request, auth.headers, toBe);
    expect(after.sha256, "TO BE bpmn_xml неизменен (0 мутаций)").toBe(before.sha256);
    expect(after.diagramStateVersion, "diagram_state_version неизменен").toBe(before.diagramStateVersion);
    expect(after.bpmnXmlVersion, "bpmn_xml_version неизменен").toBe(before.bpmnXmlVersion);
    segmentActive = false;
    expect(diagramMutations, "0 мутаций диаграммы за весь тест").toEqual([]);
    expect(whitelistViolations, "0 неизолированных чтений ghost-источника").toEqual([]);
    console.log(
      `[tobe-overlay-provenance] noise: presence/batch=${loggedNoise.presence}, `
      + `to_be reads=${loggedNoise.sessionReads}, foreign=${loggedNoise.foreignReads}; `
      + `shots: ${shotForward}, ${shotReverse}`,
    );
  });

  test("save/reload: подсветка восстановлена после строгого reload (регресс «баг F5»)", async ({ page }) => {
    const { projectId, orgId, toBe } = pairA;
    await setUiToken(page, auth.accessToken);
    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
      window.__FPC_E2E_PAUSE_AUTOSAVE__ = true;
    });
    await page.addInitScript((value) => {
      if (value) window.localStorage.setItem("fpc_active_org_id", value);
    }, orgId);
    await bootLinkedToBe(page, projectId, toBe);

    const editorSel = await editorLayerSel(page);
    await expect(page.locator(GHOST_CANVAS)).toBeVisible({ timeout: 20000 });

    // Штатное сохранение (автосейв на паузе e2e-флагом — паттерн референса).
    await page.getByTestId("diagram-toolbar-save").click();
    await page.waitForTimeout(1000);

    await page.reload();
    await bootLinkedToBe(page, projectId, toBe, { navigate: false });
    await expect(page.locator(GHOST_CANVAS)).toBeVisible({ timeout: 20000 });

    // Тот же клик по op_consolidated → подсветка восстановлена из персистнутого
    // XML (индекс пересобран адаптером T8 после reload).
    const editorSelAfterReload = await editorLayerSel(page);
    await clickUntilAncestors(page, editorSelAfterReload, "op_consolidated", 3);
    await expect.poll(async () => page.locator(ANCESTOR).count(), {
      timeout: 5000,
      message: "после reload+click — ровно 3 ghost-маркера",
    }).toBe(3);
    await expect(page.locator(GHOST_CANVAS)).toHaveClass(/provenance-dim/);
  });

  test("empty-state: hint ровно один раз, dismiss скрывает (T11)", async ({ page }) => {
    const { projectId, orgId, toBe } = pairB;
    await setUiToken(page, auth.accessToken);
    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
      window.__FPC_E2E_PAUSE_AUTOSAVE__ = true;
    });
    await page.addInitScript((value) => {
      if (value) window.localStorage.setItem("fpc_active_org_id", value);
    }, orgId);
    await bootLinkedToBe(page, projectId, toBe);

    const editorSel = await editorLayerSel(page);
    await expect(page.locator(GHOST_CANVAS)).toBeVisible({ timeout: 20000 });

    // Первый selection → hint виден (retry: listener вешается при status
    // "empty" после ленивой гидратации индекса).
    await clickUntilEmptyHint(page, editorSel, "op_new");
    const hint = page.getByTestId("tobe-prov-empty-hint");
    await expect(hint).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("tobe-prov-empty-hint")).toHaveCount(1);
    const shotEmpty = await saveScreenshot(page, "empty-state");

    // Второй selection → hint НЕ дублируется.
    await clickElementCenter(page, editorSel, "op_simple");
    await expect(page.getByTestId("tobe-prov-empty-hint")).toHaveCount(1);
    await expect(hint).toBeVisible();

    // Dismiss «Понятно» → скрыт.
    await page.getByTestId("tobe-prov-empty-dismiss").click();
    await expect(hint).toHaveCount(0);
    console.log(`[tobe-overlay-provenance] empty-state shot: ${shotEmpty}`);
  });

  test("off-флаг: ни маркеров, ни бейджа, ни hint в DOM", async ({ page, request }) => {
    const { projectId, orgId, toBe } = pairA;
    await setUiToken(page, auth.accessToken);
    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
      window.__FPC_E2E_PAUSE_AUTOSAVE__ = true;
    });
    await page.addInitScript((value) => {
      if (value) window.localStorage.setItem("fpc_active_org_id", value);
    }, orgId);
    await bootLinkedToBe(page, projectId, toBe);

    await setFlag(request, auth, "tobe_overlay_underlay", false);
    await page.reload();
    await bootLinkedToBe(page, projectId, toBe, { navigate: false });

    // Слой подложки и контролы не рендерятся (гейт BpmnStage на флаге).
    await expect(page.getByTestId("bpmn-layer-underlay-asis")).toHaveCount(0);
    await expect(page.getByTestId("tobe-underlay-toggle")).toHaveCount(0);

    const editorSel = await editorLayerSel(page);
    await clickElementCenter(page, editorSel, "op_consolidated");
    await clickStageCorner(page);
    await expect(page.locator(ANCESTOR)).toHaveCount(0);
    await expect(page.locator(BADGE)).toHaveCount(0);
    await expect(page.getByTestId("tobe-prov-empty-hint")).toHaveCount(0);
    await expect(page.locator(`${editorSel} .djs-element.tobeProvLinked`)).toHaveCount(0);
  });

  test("mid-flight: уход на as_is → чисто; возврат → подсветка + ровно 1 fetch /meta", async ({ page, request }) => {
    const { projectId, orgId, asIs, toBe } = pairA;
    await setUiToken(page, auth.accessToken);
    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
      window.__FPC_E2E_PAUSE_AUTOSAVE__ = true;
    });
    await page.addInitScript((value) => {
      if (value) window.localStorage.setItem("fpc_active_org_id", value);
    }, orgId);
    await bootLinkedToBe(page, projectId, toBe);

    const editorSel = await editorLayerSel(page);
    await expect(page.locator(GHOST_CANVAS)).toBeVisible({ timeout: 20000 });

    // Счётчик meta-фетчей по to_be sid (network count).
    let metaCount = 0;
    const metaUrlRe = new RegExp(`/api/sessions/${toBe}/meta`);
    page.on("request", (req) => {
      if (req.method() === "GET" && metaUrlRe.test(req.url())) metaCount += 1;
    });

    // Прямая подсветка работает до ухода.
    await clickUntilAncestors(page, editorSel, "op_consolidated", 3);
    await expect.poll(async () => page.locator(ANCESTOR).count(), { timeout: 5000 }).toBe(3);

    // --- Уход на as_is: linked-маркеры/badge отсутствуют, ghost демонтирован ---
    await openSessionViaHook(page, asIs);
    await expect(page.locator(GHOST_LAYER)).toHaveCount(0, { timeout: 20000 });
    await expect(page.locator(".tobeProvBadge")).toHaveCount(0);
    await expect(page.locator(".djs-element.tobeProvLinked")).toHaveCount(0);

    // --- Возврат на to_be: подсветка работает, meta fetch ровно 1 (delta) ---
    const metaBeforeReturn = metaCount;
    await openSessionViaHook(page, toBe);
    await expect(page.locator(GHOST_CANVAS)).toBeVisible({ timeout: 20000 });
    // Индекс пересобирается лениво — ждём функционально (retry-клик).
    const editorSel2 = await editorLayerSel(page);
    await clickUntilAncestors(page, editorSel2, "op_consolidated", 3);
    await expect.poll(async () => page.locator(ANCESTOR).count(), {
      timeout: 5000,
      message: "после возврата прямая подсветка работает",
    }).toBe(3);
    // Ровно один meta-фетч за визит (кэш T8 per mount; persistence meta — только
    // перед save, автосейв на паузе).
    expect(metaCount - metaBeforeReturn, "ровно 1 GET /meta на визит to_be").toBe(1);
  });
});
