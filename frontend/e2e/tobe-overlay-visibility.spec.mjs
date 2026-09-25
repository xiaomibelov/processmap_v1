// E2E-спека feature/tobe-overlay-visibility-provenance-v1 (T5) — видимость
// ghost-подложки AS IS (пресеты faint/medium/strong, persist, off-флаг):
//   1. Флаг on + связанная пара → дефолт medium: ghost-слой виден, computed
//      opacity .tobeOverlayUnderlay-canvas ≈ 0.55, selected-сегмент «Средне»
//      (aria-checked на tobe-ghost-preset-medium).
//   2. Переключение пресетов: «Призрак» ≈ 0.30, «Чётко» ≈ 0.85; тогл
//      hide/show («AS IS-подложка») скрывает ghost-контейнер (display:none,
//      host-слой остаётся в DOM) и НЕ сбрасывает пресет.
//   3. Persist: «Чётко» → page.reload() → сегмент «Чётко» selected,
//      opacity ≈ 0.85 (localStorage, ключ tobe_underlay_ghost_visibility).
//   4. Off-флаг: setFlag tobe_overlay_underlay=false → reload → слоя
//      (bpmn-layer-underlay-asis / .bpmnLayer--underlayAsis) нет в DOM,
//      контрол-группа (tobe-underlay-toggle) не рендерится.
//   5. Whitelist-read (наследие #1034): на ON-сценарии разрешены только
//      GET sessions/{id} обеих сессий, GET bpmn строго с
//      raw=1&include_overlay=0, GET sessions/{toBeId}/meta (T8); любая
//      мутация / вне-whitelist read нашего контура = fail. Механика — по
//      образцу tobe-overlay-underlay.spec.mjs, добавлено разрешение /meta.
// Доказательная база (review владельца №1): скриншоты пресетов пишутся в
// artifacts/tobe-visibility/{medium,faint,strong}.png (artifacts/ в gitignore).
// DOM-контракт (Track 1, T1–T4): host .bpmnLayer--underlayAsis
// [data-testid=bpmn-layer-underlay-asis] → .bpmnCanvas → ghost-контейнер
// .tobeOverlayUnderlay-canvas.tobeOverlayUnderlay-canvas--asis; CSS-модификатор
// пресета (bpmnLayer--underlayAsis--faint|medium|strong) и базовый opacity
// висят на ОДНОМ элементе (контейнере), позднее правило побеждает — computed
// opacity на .tobeOverlayUnderlay-canvas == значение пресета.
// Лендинг: linked to_be открывается визардом TO BE → перед ожиданием
// диаграммы кликаем вкладку «Схема» (подложка живёт на BPMN-стадии).
// Требует живого стека (E2E_APP_BASE_URL / E2E_API_BASE_URL).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, openFixture } from "./helpers/processFixture.mjs";

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.resolve(SPEC_DIR, "../../artifacts/tobe-visibility");

const RUN_ID = `tobe_vis_${Date.now()}`;
const ASIS_MARKER = "TobeVisE2E_AsisMarker";

// Пресет → ожидаемый computed opacity (ghostVisibilityPresets.js, UI.md D2).
const PRESET_OPACITY = { faint: 0.30, medium: 0.55, strong: 0.85 };
const OPACITY_TOLERANCE = 0.05;

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

// HYPOTHESIS (по образцу tobe-overlay-underlay.spec.mjs): quick_skeleton может
// не принять extra поля → пробуем create c extra, верификация GET, fallback
// PATCH + повторный GET. Не установилось — setup падает до assert-окна.
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

async function createLinkedPair(request, auth, label) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: auth.headers,
    data: { title: `E2E tobe visibility ${label}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  const orgId = String(project.org_id || project.orgId || project.organization_id || "").trim();
  expect(projectId).not.toBe("");

  const asIs = await createQuickSession(request, auth.headers, projectId, `AS IS ${label}`);
  await putBpmn(request, auth.headers, asIs, asIsXml(ASIS_MARKER, `TobeVis AS IS ${label}`));
  const toBe = await createLinkedToBeSession(request, auth.headers, projectId, `TO BE ${label}`, asIs);
  await putBpmn(request, auth.headers, toBe, asIsXml("TobeVisE2E_TobeMarker", `TobeVis TO BE ${label}`));
  return { projectId, orgId, asIs, toBe };
}

// Linked to_be открывается визардом TO BE — подложка и сегментed-контрол
// живут на вкладке «Схема». Кликаем, только если таб появился (как референс).
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

// Строгое ожидание готовности стадии: sentinel [data-testid=diagram-ready]
// рендерится только при loadState ready/canvas-ready (diagramReady =
// isReady, BpmnStage:1411). Слабый waitForDiagramReady НЕ подходит: его
// fallback (__FPC_E2E_MODELER__ / .djs-viewport) срабатывает на создании
// modeler'а ДО завершения importXML — окно assert'ов открывается раньше
// реальной готовности (прогон 1: loadState завис в importing, ghost не
// смонтировался, тест падал по таймауту).
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

// Единый boot-путь для первого входа и после page.reload(): init-scripts уже
// применены (addInitScript живёт через навигации), токен в localStorage
// переживает reload — здесь только org-chooser, вкладка «Схема», readiness.
// navigate=false — страница уже на целевом URL (сразу после reload);
// повторный goto в этом окне гонится с in-flight навигацией (ERR_ABORTED).
// Race-устойчивость: если стадия зависла в importing (известная продуктовая
// гонка при раннем клике по вкладке «Схема»; таймауты state machine в
// BpmnStage выключены → сама не восстанавливается), делаем ОДИН полный
// reload и повторяем boot — чистый remount стадии консистентен.
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

async function readGhostCanvasOpacity(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".bpmnLayer--underlayAsis .tobeOverlayUnderlay-canvas");
    if (!canvas) return null;
    return Number(getComputedStyle(canvas).opacity);
  });
}

// Ожидание computed opacity пресета с учётом CSS-transition (0.15s ease на
// контейнере): поллим, пока не попадём в допуск ±0.05.
async function expectPresetOpacity(page, preset, message) {
  const expected = PRESET_OPACITY[preset];
  await expect
    .poll(async () => {
      const value = await readGhostCanvasOpacity(page);
      return value !== null ? Math.abs(value - expected) : Infinity;
    }, { timeout: 10000, message: message || `ghost opacity ≈ ${expected} (${preset})` })
    .toBeLessThanOrEqual(OPACITY_TOLERANCE);
}

async function savePresetScreenshot(page, preset) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const file = path.join(ARTIFACTS_DIR, `${preset}.png`);
  await page.screenshot({ path: file });
  return file;
}

test.describe("tobe-overlay-visibility (T5)", () => {
  let auth;
  let pairOn; // ON-сценарий (whitelist-read)
  let pairOff; // off-флаг сценарий

  test.beforeAll(async ({ request }) => {
    auth = await apiLogin(request, { apiBase: API_BASE });
    await setFlag(request, auth, "tobe_overlay_underlay", true);
    await setFlag(request, auth, "tobe_overlay_mock", false);
    pairOn = await createLinkedPair(request, auth, `${RUN_ID} on`);
    pairOff = await createLinkedPair(request, auth, `${RUN_ID} off`);
  });

  test.afterAll(async ({ request }) => {
    // Глобальный флаг не оставляем выключенным: восстанавливаем on.
    await setFlag(request, auth, "tobe_overlay_underlay", true);
  });

  test("пресеты видимости: дефолт medium, faint/strong, hide/show, persist (reload)", async ({ page, request }) => {
    const { projectId, orgId, asIs, toBe } = pairOn;

    // --- Сетевые инварианты (whitelist-read #1034, держим) ---
    // Механика — по образцу tobe-overlay-underlay.spec.mjs (:258+): hard-fail
    // ТОЛЬКО на (а) мутациях диаграммы и (б) неизолированных чтениях
    // ghost-источника (AS IS). Прочие GET (events/versions/note-aggregate/
    // auto-pass precheck — штатный read-only трафик активной to_be-сессии)
    // — кумулятивный noise в лог, НЕ fail: strict-режим «только whitelist-
    // GETы» несовместим с живым приложением (прогон 1: events, bpmn/versions,
    // note-aggregate, auto-pass/precheck — все 200 read-only). Добавление
    // контура T8 (GET sessions/{toBeId}/meta) покрывается noise-терпимостью.
    const diagramMutations = [];
    const whitelistViolations = [];
    const loggedNoise = { presence: 0, foreignReads: 0, sessionReads: 0 };
    let segmentActive = false;

    page.on("request", (req) => {
      const url = req.url();
      if (!url.includes("/api/sessions/")) return;
      const method = req.method();
      const isPresence = /\/api\/sessions\/[^/?#]+\/presence/.test(url);
      if (["PUT", "PATCH", "DELETE"].includes(method) && !isPresence) {
        diagramMutations.push({ method, url });
        return;
      }
      if (isPresence) {
        loggedNoise.presence += 1;
        return;
      }
      if (!segmentActive) return;
      const m = url.match(/\/api\/sessions\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?/);
      if (!m) return;
      const sid = decodeURIComponent(m[1]);
      const sub = m[2] || "";
      if (sid === asIs) {
        // Ghost-источник (#1034): допустимы только запись сессии и bpmn-read
        // строго с raw=1&include_overlay=0. Всё остальное по AS IS — fail.
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
        loggedNoise.sessionReads += 1; // read-only трафик активной сессии
        return;
      }
      loggedNoise.foreignReads += 1; // чужие сессии — вне контура
    });

    // --- Вход в to_be (ON) ---
    await setUiToken(page, auth.accessToken);
    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
      window.__FPC_E2E_PAUSE_AUTOSAVE__ = true;
    });
    await page.addInitScript((value) => {
      if (value) window.localStorage.setItem("fpc_active_org_id", value);
    }, orgId);
    await bootLinkedToBe(page, projectId, toBe);

    const hostLayer = page.getByTestId("bpmn-layer-underlay-asis");
    const ghostCanvas = page.locator(".bpmnLayer--underlayAsis .tobeOverlayUnderlay-canvas").first();
    const toggle = page.getByTestId("tobe-underlay-toggle");

    // Ghost смонтирован и содержит элемент РЕАЛЬНОЙ AS IS.
    await expect(hostLayer).toBeVisible({ timeout: 20000 });
    await expect(ghostCanvas).toBeVisible({ timeout: 20000 });
    await expect(
      page.locator(`.bpmnLayer--underlayAsis [data-element-id="${ASIS_MARKER}"]`),
    ).toBeAttached({ timeout: 20000 });
    segmentActive = true;

    // --- Сценарий 1: флаг on + связанная пара → дефолт medium ---
    await expect(page.getByTestId("tobe-ghost-preset-medium"))
      .toHaveAttribute("aria-checked", "true", { timeout: 20000 });
    await expect(page.getByTestId("tobe-ghost-preset-faint"))
      .toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("tobe-ghost-preset-strong"))
      .toHaveAttribute("aria-checked", "false");
    await expectPresetOpacity(page, "medium", "дефолт medium: computed opacity ≈ 0.55");
    const shotMedium = await savePresetScreenshot(page, "medium");

    // --- Сценарий 2: переключение пресетов ---
    await page.getByTestId("tobe-ghost-preset-faint").click();
    await expect(page.getByTestId("tobe-ghost-preset-faint")).toHaveAttribute("aria-checked", "true");
    await expectPresetOpacity(page, "faint", "«Призрак»: computed opacity ≈ 0.30");
    const shotFaint = await savePresetScreenshot(page, "faint");

    await page.getByTestId("tobe-ghost-preset-strong").click();
    await expect(page.getByTestId("tobe-ghost-preset-strong")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("tobe-ghost-preset-medium")).toHaveAttribute("aria-checked", "false");
    await expectPresetOpacity(page, "strong", "«Чётко»: computed opacity ≈ 0.85");
    const shotStrong = await savePresetScreenshot(page, "strong");

    // Тогл hide/show: ghost-контейнер скрывается (display:none), host-слой
    // остаётся в DOM; пресет НЕ сбрасывается — после show тот же computed.
    await toggle.click();
    await expect(ghostCanvas, "ghost-контейнер скрыт (display:none)").toBeHidden();
    await expect(hostLayer, "host-слой подложки остаётся в DOM").toBeAttached();
    await expect(page.getByTestId("tobe-ghost-preset-strong"))
      .toHaveAttribute("aria-checked", "true", "пресет не сброшен при hide");
    await toggle.click();
    await expect(ghostCanvas, "ghost-контейнер снова виден").toBeVisible();
    await expectPresetOpacity(page, "strong", "после show — прежний computed opacity (strong)");

    // --- Сценарий 3: persist через page.reload() ---
    await page.reload();
    await bootLinkedToBe(page, projectId, toBe, { navigate: false });
    await expect(hostLayer).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("tobe-ghost-preset-strong"))
      .toHaveAttribute("aria-checked", "true", { timeout: 20000 });
    await expect(page.getByTestId("tobe-ghost-preset-medium")).toHaveAttribute("aria-checked", "false");
    await expectPresetOpacity(page, "strong", "после reload — persist strong ≈ 0.85");
    // localStorage-контраст: persisted-пресет реально из ключа контура.
    const persisted = await page.evaluate(() => window.localStorage.getItem("tobe_underlay_ghost_visibility"));
    expect(persisted, "localStorage tobe_underlay_ghost_visibility").toBe("strong");

    // --- Сетевые hard-assert'ы (whitelist-read #1034) ---
    segmentActive = false;
    expect(diagramMutations, "0 мутаций диаграммы за весь тест").toEqual([]);
    expect(whitelistViolations, "0 неизолированных чтений ghost-источника (bpmn строго raw=1&include_overlay=0)").toEqual([]);
    console.log(
      `[tobe-overlay-visibility] noise: presence=${loggedNoise.presence}, `
      + `to_be session reads=${loggedNoise.sessionReads}, foreign=${loggedNoise.foreignReads}`,
    );

    console.log(`[tobe-overlay-visibility] screenshots: ${shotMedium}, ${shotFaint}, ${shotStrong}`);
  });

  test("off-флаг: слой и контрол-группа отсутствуют в DOM после reload", async ({ page, request }) => {
    const { projectId, orgId, asIs, toBe } = pairOff;

    await setUiToken(page, auth.accessToken);
    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
      window.__FPC_E2E_PAUSE_AUTOSAVE__ = true;
    });
    await page.addInitScript((value) => {
      if (value) window.localStorage.setItem("fpc_active_org_id", value);
    }, orgId);

    // Санити-вход при включённом флаге: слой и контрол присутствуют.
    await bootLinkedToBe(page, projectId, toBe);
    await expect(page.getByTestId("bpmn-layer-underlay-asis")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("tobe-underlay-toggle")).toBeVisible({ timeout: 20000 });

    // Off-флаг → reload → слоя нет в DOM, контрол-группа не рендерится.
    await setFlag(request, auth, "tobe_overlay_underlay", false);
    await page.reload();
    await bootLinkedToBe(page, projectId, toBe);
    await expect(page.getByTestId("bpmn-layer-underlay-asis"), "off-флаг: host-слой отсутствует")
      .toHaveCount(0);
    await expect(page.locator(".bpmnLayer--underlayAsis"), "off-флаг: .bpmnLayer--underlayAsis отсутствует")
      .toHaveCount(0);
    await expect(page.getByTestId("tobe-underlay-toggle"), "off-флаг: контрол-группа не рендерится")
      .toHaveCount(0);
    await expect(page.getByTestId("tobe-ghost-preset-medium"), "off-флаг: пресет-контрол не рендерится")
      .toHaveCount(0);
    // AS IS-источник остаётся нетронутым (наш контур не пишет в него).
    expect(String(asIs).length).toBeGreaterThan(0);
  });
});
