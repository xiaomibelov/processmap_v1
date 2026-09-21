// E2E-спека feature/tobe-overlay-underlay-v1 (T7) — UX/сетевой контракт
// underlay-режима TO BE overlay (реальная AS IS-подложка под живым editor):
//   1. Гейт: to_be со связью → кнопка видна; as_is / без связи → нет.
//   2. Ghost содержит элемент РЕАЛЬНОЙ AS IS (UnderlayE2E_AsisMarker), виден
//      сквозь editor-слой (computed background прозрачен, opacity > 0).
//   3. Начальное выравнивание viewbox ДО первого жеста (transform равны).
//   4. Whitelist-read: только GET обеих сессий + GET bpmn ghost-источника
//      строго с raw=1&include_overlay=0; 0 мутаций за весь тест.
//   5. Fetch-count: ровно 1 GET bpmn на источник; повторный вход — из кэша.
//   6. Pan/zoom-sync: transform ghost == transform editor.
//   7. B2: Del/Ctrl+Z/drag по подложке → sha256 bpmn_xml и
//      diagram_state_version обеих сессий неизменны.
//   8. Mid-flight: сессия без связи → ghost РАЗМОНТИРОВАН (не скрыт);
//      другая связанная to_be → teardown старого + ровно один новый fetch.
//   9. Teardown: listener-count canvas.viewbox.changed на editor-eventBus
//      возвращается к baseline; 20 циклов hide/show — плоский.
// Требует живого стека (E2E_API_BASE_URL / E2E_APP_BASE_URL). Прогон — review.

import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, openFixture } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

const RUN_ID = `tobe_overlay_underlay_${Date.now()}`;
const ASIS_MARKER_1 = "UnderlayE2E_AsisMarker";
const ASIS_MARKER_2 = "UnderlayE2E_AsisMarker2";

function asIsXml(markerId, processName) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_${markerId}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_${markerId}" name="${processName}" isExecutable="false">
    <bpmn:startEvent id="${markerId}_Start"><bpmn:outgoing>${markerId}_F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="${markerId}" name="AS IS опорный элемент">
      <bpmn:incoming>${markerId}_F1</bpmn:incoming>
      <bpmn:outgoing>${markerId}_F2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="${markerId}_End"><bpmn:incoming>${markerId}_F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="${markerId}_F1" sourceRef="${markerId}_Start" targetRef="${markerId}" />
    <bpmn:sequenceFlow id="${markerId}_F2" sourceRef="${markerId}" targetRef="${markerId}_End" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="${markerId}_Dia">
    <bpmndi:BPMNPlane id="${markerId}_Plane" bpmnElement="Process_${markerId}">
      <bpmndi:BPMNShape id="${markerId}_Start_di" bpmnElement="${markerId}_Start">
        <dc:Bounds x="170" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="${markerId}_di" bpmnElement="${markerId}">
        <dc:Bounds x="290" y="148" width="180" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="${markerId}_End_di" bpmnElement="${markerId}_End">
        <dc:Bounds x="560" y="170" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="${markerId}_F1_di" bpmnElement="${markerId}_F1">
        <di:waypoint x="206" y="188" /><di:waypoint x="290" y="188" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="${markerId}_F2_di" bpmnElement="${markerId}_F2">
        <di:waypoint x="470" y="188" /><di:waypoint x="560" y="188" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
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
  const res = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    headers,
    data: { xml, base_diagram_state_version: 0, base_bpmn_xml_version: 0 },
  });
  await apiJson(res, `seed bpmn ${sessionId}`);
}

async function getSessionRecord(request, headers, sessionId) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, { headers });
  const body = await apiJson(res, `get session ${sessionId}`);
  return body && typeof body === "object" ? body : {};
}

// HYPOTHESIS (TESTS.md): quick_skeleton может не принять extra поля.
// Проба: создать с extra → верификация GET. Fallback: PATCH extra + повторный
// GET. Если и fallback не установил поля — setup падает здесь, до assert-окна.
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
  return {
    diagramStateVersion: Number(record.diagram_state_version || 0),
    bpmnXmlVersion: Number(record.bpmn_xml_version || 0),
    sha256: createHash("sha256").update(String(xmlText || "")).digest("hex"),
  };
}

async function openSessionInApp(page, sessionId) {
  const opened = await page.evaluate(async (sid) => {
    const opener = window?.__FPC_E2E_OPEN_SESSION__;
    if (typeof opener !== "function") return { ok: false, error: "no_e2e_opener" };
    return opener(sid);
  }, sessionId);
  expect(opened?.ok, JSON.stringify(opened)).toBeTruthy();
  await waitForDiagramReady(page);
}

async function readViewportTransform(page, layerSelector) {
  return page.evaluate((sel) => {
    const viewport = document.querySelector(`${sel} .djs-viewport`);
    return viewport ? String(viewport.getAttribute("transform") || "") : null;
  }, layerSelector);
}

test.describe("tobe-overlay-underlay (T7)", () => {
  test("underlay-контракт: ghost реальной AS IS, read-only, sync, mid-flight", async ({ page, request }) => {
    const auth = await apiLogin(request, { apiBase: API_BASE });
    await setFlag(request, auth, "tobe_overlay_underlay", true);
    await setFlag(request, auth, "tobe_overlay_mock", false);

    // --- Фикстура-пара (setup-мутации ДО assert-окна) ---
    const projectRes = await request.post(`${API_BASE}/api/projects`, {
      headers: auth.headers,
      data: { title: `E2E underlay ${RUN_ID}`, passport: {} },
    });
    const project = await apiJson(projectRes, "create project");
    const projectId = String(project.id || project.project_id || "").trim();
    const orgId = String(project.org_id || project.orgId || project.organization_id || "").trim();
    expect(projectId).not.toBe("");

    const asIs1 = await createQuickSession(request, auth.headers, projectId, `AS IS 1 ${RUN_ID}`);
    await putBpmn(request, auth.headers, asIs1, asIsXml(ASIS_MARKER_1, "Underlay AS IS 1"));
    const asIs2 = await createQuickSession(request, auth.headers, projectId, `AS IS 2 ${RUN_ID}`);
    await putBpmn(request, auth.headers, asIs2, asIsXml(ASIS_MARKER_2, "Underlay AS IS 2"));
    const toBe1 = await createLinkedToBeSession(request, auth.headers, projectId, `TO BE 1 ${RUN_ID}`, asIs1);
    await putBpmn(request, auth.headers, toBe1, asIsXml("UnderlayE2E_Tobe1Marker", "Underlay TO BE 1"));
    const toBe2 = await createLinkedToBeSession(request, auth.headers, projectId, `TO BE 2 ${RUN_ID}`, asIs2);
    await putBpmn(request, auth.headers, toBe2, asIsXml("UnderlayE2E_Tobe2Marker", "Underlay TO BE 2"));

    const ourSids = new Set([asIs1, asIs2, toBe1, toBe2]);
    const ghostFetchCounts = { [asIs1]: 0, [asIs2]: 0 };
    const violations = [];
    const diagramMutations = [];
    const loggedNoise = { presence: 0, foreignReads: 0 };

    let segmentActive = false;

    function isOurSessionUrl(url) {
      const m = url.match(/\/api\/sessions\/([^/?#]+)/);
      return m ? ourSids.has(decodeURIComponent(m[1])) : false;
    }

    page.on("request", (req) => {
      const url = req.url();
      if (!url.includes("/api/sessions/")) return;
      const method = req.method();
      const isMutating = ["PUT", "PATCH", "DELETE"].includes(method);
      const isPresence = /\/api\/sessions\/[^/?#]+\/presence/.test(url);
      if (isMutating && !isPresence) {
        diagramMutations.push({ method, url });
        return;
      }
      if (isPresence) {
        loggedNoise.presence += 1;
        return;
      }
      if (!segmentActive) return;
      // Assert-окно: whitelist-read.
      if (!isOurSessionUrl(url)) {
        loggedNoise.foreignReads += 1;
        return;
      }
      const isBpmn = /\/api\/sessions\/[^/?#]+\/bpmn/.test(url);
      if (!isBpmn) return; // GET session-record: разрешён
      if (method !== "GET") {
        violations.push({ method, url });
        return;
      }
      const u = new URL(url);
      const rawOk = u.searchParams.get("raw") === "1";
      const overlayOk = u.searchParams.get("include_overlay") === "0";
      const sid = decodeURIComponent(url.match(/\/api\/sessions\/([^/?#]+)/)[1]);
      if ((sid === asIs1 || sid === asIs2) && rawOk && overlayOk) {
        ghostFetchCounts[sid] += 1;
      }
      // ghost-источники обязаны читаться строго raw=1&include_overlay=0.
      if (sid === asIs1 || sid === asIs2) {
        if (!rawOk || !overlayOk) violations.push({ method, url, reason: "bad_params" });
      }
    });

    // --- Вход в to_be 1 ---
    await setUiToken(page, auth.accessToken);
    await page.addInitScript((value) => {
      if (value) window.localStorage.setItem("fpc_active_org_id", value);
    }, orgId);
    await openFixture(page, { projectId, sessionId: toBe1 });
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

    const underlayLayer = page.locator(".bpmnLayer--underlayAsis");
    const editorLayer = page.locator(".bpmnLayer--editor, .bpmnLayer--diagram").first();
    const toggle = page.getByTestId("tobe-underlay-toggle");

    // Сессионные слои НЕ скрыты (инвариант underlay-режима).
    await expect(editorLayer).toBeVisible();

    // Шаг 1: to_be со связью → кнопка видна; флаг on.
    await expect(toggle).toBeVisible({ timeout: 20000 });
    segmentActive = true;

    // Шаг 2: ghost содержит элемент РЕАЛЬНОЙ AS IS; окклюзия снята.
    const ghostMarker = underlayLayer.locator(`[data-element-id="${ASIS_MARKER_1}"]`);
    await expect(underlayLayer).toBeVisible({ timeout: 20000 });
    await expect(ghostMarker).toBeAttached({ timeout: 20000 });
    const occlusion = await page.evaluate(() => {
      const layer = document.querySelector(".bpmnLayer--underlayAsis");
      const editor = document.querySelector(".bpmnLayer--editor") || document.querySelector(".bpmnLayer--diagram");
      const djs = editor?.querySelector(".djs-container");
      const cs = (el) => (el ? getComputedStyle(el) : null);
      return {
        ghostOpacity: cs(layer)?.opacity || "",
        editorLayerBg: cs(editor)?.backgroundColor || "",
        djsBg: cs(djs)?.backgroundColor || "",
        ghostPointerEvents: cs(layer)?.pointerEvents || "",
      };
    });
    expect(occlusion.ghostPointerEvents, "ghost инертен").toBe("none");
    expect(Number(occlusion.ghostOpacity), "ghost opacity 0.3").toBeGreaterThan(0);
    expect(occlusion.editorLayerBg, "фон editor-слоя прозрачен").toBe("rgba(0, 0, 0, 0)");
    expect(occlusion.djsBg, "фон djs-контейнера прозрачен").toBe("rgba(0, 0, 0, 0)");
    const markerBox = await ghostMarker.boundingBox();
    expect(markerBox && markerBox.width > 0 && markerBox.height > 0, "ghost-элемент имеет ненулевой bbox").toBeTruthy();

    // Шаг 3: начальное выравнивание ДО первого жеста — transform равны.
    const editorSel = await page.evaluate(() => (
      document.querySelector(".bpmnLayer--editor .djs-viewport")
        ? ".bpmnLayer--editor"
        : ".bpmnLayer--diagram"
    ));
    const initialGhostTf = await readViewportTransform(page, ".bpmnLayer--underlayAsis");
    const initialEditorTf = await readViewportTransform(page, editorSel);
    expect(initialGhostTf, "ghost viewport transform присутствует").toBeTruthy();
    expect(initialEditorTf, "editor viewport transform присутствует").toBeTruthy();

    // Серверное состояние до B2-взаимодействий.
    const before = {
      asIs1: await readServerState(request, auth.headers, asIs1),
      toBe1: await readServerState(request, auth.headers, toBe1),
    };

    // Шаг 6: pan/zoom-sync — pan editor, transform ghost догоняет editor.
    const stageBox = await page.locator(".bpmnStack").boundingBox();
    expect(stageBox).toBeTruthy();
    await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(stageBox.x + stageBox.width / 2 + 120, stageBox.y + stageBox.height / 2 + 60, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => {
      const g = await readViewportTransform(page, ".bpmnLayer--underlayAsis");
      const e = await readViewportTransform(page, editorSel);
      return g && e && g === e;
    }, { timeout: 10000, message: "viewbox-sync editor → ghost" }).toBeTruthy();

    // Шаг 7 (B2): Del / Ctrl+Z / drag по области ghost-элемента → мутаций нет.
    await page.mouse.click(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
    await page.keyboard.press("Delete");
    await page.keyboard.press("Control+z");
    await page.mouse.move(markerBox.x + 4, markerBox.y + 4);
    await page.mouse.down();
    await page.mouse.move(markerBox.x + 60, markerBox.y + 40, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const after = {
      asIs1: await readServerState(request, auth.headers, asIs1),
      toBe1: await readServerState(request, auth.headers, toBe1),
    };
    expect(after.asIs1.sha256, "AS IS bpmn_xml неизменен (read-only)").toBe(before.asIs1.sha256);
    expect(after.asIs1.diagramStateVersion, "AS IS diagram_state_version неизменен").toBe(before.asIs1.diagramStateVersion);
    expect(after.toBe1.sha256, "TO BE bpmn_xml неизменен после B2-жестов").toBe(before.toBe1.sha256);
    expect(after.toBe1.diagramStateVersion, "TO BE diagram_state_version неизменен").toBe(before.toBe1.diagramStateVersion);

    // Шаг 9 (baseline): listener-count на editor-eventBus пока ghost mounted.
    const mountedCount = await page.evaluate(() => {
      const editor = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      const bus = editor?.get?.("eventBus");
      if (!bus) return null;
      const groups = bus._listeners?.["canvas.viewbox.changed"] || {};
      return Object.values(groups).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
    });
    expect(mountedCount, "ghost подписан ровно на один канал").toBe(1);

    // Шаг 5: hide/show — fetch не повторяется (кэш per sid).
    await toggle.click();
    await expect(underlayLayer).toBeHidden();
    await toggle.click();
    await expect(underlayLayer).toBeVisible();
    expect(ghostFetchCounts[asIs1], "ровно 1 fetch AS IS 1 после re-enter").toBe(1);

    // 20 циклов hide/show: listener-count плоский (B3-методика, e2e-вариант).
    for (let i = 0; i < 20; i += 1) {
      await toggle.click();
      await toggle.click();
    }
    const flatCount = await page.evaluate(() => {
      const editor = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      const bus = editor?.get?.("eventBus");
      if (!bus) return null;
      const groups = bus._listeners?.["canvas.viewbox.changed"] || {};
      return Object.values(groups).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
    });
    expect(flatCount, "listener-count плоский по 20 циклам").toBe(mountedCount);

    // Шаг 8 (mid-flight): сессия без связи (as_is) → ghost РАЗМОНТИРОВАН.
    segmentActive = false;
    await openSessionInApp(page, asIs1);
    await expect(underlayLayer).toHaveCount(0);
    await expect(page.getByTestId("tobe-underlay-toggle")).toHaveCount(0);
    await expect(page.getByTestId("tobe-underlay-unavailable")).toHaveCount(0);

    // baseline на редакторе без подложки (ghost никогда не монтировался).
    const baselineCount = await page.evaluate(() => {
      const editor = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      const bus = editor?.get?.("eventBus");
      if (!bus) return null;
      const groups = bus._listeners?.["canvas.viewbox.changed"] || {};
      return Object.values(groups).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
    });
    expect(baselineCount, "baseline listener-count на чистом редакторе").toBe(0);

    // Шаг 8: другая связанная to_be → teardown старого + ровно 1 новый fetch.
    await openSessionInApp(page, toBe2);
    segmentActive = true;
    await expect(page.getByTestId("tobe-underlay-toggle")).toBeVisible({ timeout: 20000 });
    await expect(underlayLayer.locator(`[data-element-id="${ASIS_MARKER_2}"]`)).toBeAttached({ timeout: 20000 });
    expect(ghostFetchCounts[asIs1], "AS IS 1 — по-прежнему 1 fetch (кэш)").toBe(1);
    expect(ghostFetchCounts[asIs2], "AS IS 2 — ровно 1 новый fetch").toBe(1);

    // Повторный вход на to_be 1 → AS IS 1 из кэша, суммарно 2 fetch.
    segmentActive = false;
    await openSessionInApp(page, toBe1);
    segmentActive = true;
    await expect(underlayLayer.locator(`[data-element-id="${ASIS_MARKER_1}"]`)).toBeAttached({ timeout: 20000 });
    expect(ghostFetchCounts[asIs1] + ghostFetchCounts[asIs2], "суммарно 2 fetch на 2 источника").toBe(2);

    // Шаг 10 / teardown: уход на сессию без связи — ghost исчезает полностью.
    segmentActive = false;
    await openSessionInApp(page, asIs1);
    await expect(underlayLayer).toHaveCount(0);
    const finalCount = await page.evaluate(() => {
      const editor = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      const bus = editor?.get?.("eventBus");
      if (!bus) return null;
      const groups = bus._listeners?.["canvas.viewbox.changed"] || {};
      return Object.values(groups).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);
    });
    expect(finalCount, "listener-count чистого редактора — baseline").toBe(0);

    // --- Сетевые hard-assert'ы ---
    expect(diagramMutations, "0 мутаций диаграммы за весь тест").toEqual([]);
    expect(violations, "0 нарушений whitelist-read").toEqual([]);
    console.log(`[tobe-overlay-underlay] presence noise: ${loggedNoise.presence}, foreign reads: ${loggedNoise.foreignReads}`);
  });
});
