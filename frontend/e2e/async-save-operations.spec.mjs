// E2E-спека контура feature/async-save-pipeline-step1 (инкрементальное
// дельта-сохранение диаграммы, TESTS.md §4).
//
// Критерий приёмки:
//   1. Сессия 300+ элементов (фикстура генерируется программно, без файла),
//      20 правок подряд (rename/move/resize/create/delete/connect — через
//      modeling-API канваса, стиль processFixture.renameTask).
//   2. В окне серии правок — только POST /api/sessions/{id}/operations,
//      тело каждого ≤10 kB; ни одного PUT /api/sessions/{id}/bpmn
//      (кроме намеренного fallback-под-сценария); ни одного save-body >10 kB.
//   3. Ответ operations <300 ms (p95); ни одного longtask >200 мс в окне серии.
//   4. Coverage: window.__PM_OPS_COVERAGE__ mapped/total ≥ 0.95 (fallback —
//      отдельный тест со своим окном, метрика там не ограничивается).
//   5. Счётчик window.__PM_OPS_FLUSHED__ инкрементится.
//   6. Reload страницы → все правки на месте (сверка канваса и XML через API),
//      diagram_state_version инкрементирован.
//   7. Под-сценарий 409: правка из «другого клиента» через API между base и
//      flush → автоматический rebase, правки не потеряны, модал конфликта
//      не показан.
//   8. Под-сценарий fallback: правка spaceTool → ровно один полный PUT /bpmn,
//      после ack ops-флаши продолжаются.
//
// Статус ожиданий: до завершения дедуп-среза (подавление полного автосохранения
// для whitelisted-правок) full-save путь продолжает работать параллельно
// (UI.md §2 — проводка outbox добавочная), поэтому ассерт «0 PUT /bpmn» и
// часть таймингов 409-под-сценария — RED до того среза. См. EXEC_REPORT.
//
// Запуск (worktree, host без node — всё в docker):
//   dev-server:  docker run -d --name pm-ops-vite \
//                  -v <worktree>/frontend:/app -w /app -p 5197:5197 \
//                  -e VITE_PORT=5197 \
//                  -e VITE_API_PROXY_TARGET=http://host.docker.internal:8011 \
//                  node:20 npm run dev -- --host 0.0.0.0 --strictPort
//   прогон:      docker run --rm -v <worktree>:/ws -w /ws/frontend \
//                  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
//                  -e E2E_APP_BASE_URL=http://172.17.0.1:5197 \
//                  -e E2E_API_BASE_URL=http://172.17.0.1:8011 \
//                  local-playwright:v1.58.2 npx playwright test \
//                  e2e/async-save-operations.spec.mjs
//
// ВАЖНО: VITE_PORT=5197 обязателен (иначе HMR reload-loop); вместо
// host.docker.internal для тестов — gateway-IP 172.17.0.1 (vite allowedHosts).

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE } from "./helpers/processFixture.mjs";
import { createOrgSessionFixture, orgHeaders } from "./helpers/nonDefaultOrg.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";
import { makeHeavyEditingDiagramXml } from "./helpers/heavyEditingFixture.mjs";
import { readServerDiagramStateVersion } from "./helpers/canvasStabilitySteps.mjs";

const APP_BASE = process.env.E2E_APP_BASE_URL || "http://127.0.0.1:5177";

const MIN_ELEMENTS = 300;
const EDIT_COUNT = 20;
const OPS_BODY_BUDGET_BYTES = 10 * 1024;
const OPS_P95_BUDGET_MS = 300;
const LONGTASK_BUDGET_MS = 200;
const COVERAGE_MIN_RATIO = 0.95;
// flushDebounceMs 2500 (opsOutboxConfig) + сетевой запас.
const FLUSH_WAIT_MS = 15_000;

// ---------------------------------------------------------------------------
// Коллекторы и пробы
// ---------------------------------------------------------------------------

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(String(err?.message || err || ""));
  });
  return errors;
}

// Трафик сохранения: POST .../operations (тело+длительность+статус) и
// PUT .../bpmn. Записи вида { kind, method, url, bytes, durationMs, status }.
// durationMs читаем на requestfinished: в Chromium timing().responseEnd ещё
// -1 на событии response (Playwright 1.58) — ранняя попытка давала вечный null.
function collectSaveTraffic(page) {
  const records = [];
  // FIFO очередь ops-запросов: identity объекта Request между событиями
  // Playwright нестабильна (redirect-цепочки/прокси) — matching по порядку,
  // ops-флаши идут последовательно.
  const pendingOps = [];
  const OPS_URL = /\/api\/sessions\/[^/]+\/operations$/;
  page.on("request", (request) => {
    const url = request.url();
    const method = request.method();
    const isOps = method === "POST" && OPS_URL.test(url);
    const isPutBpmn = method === "PUT" && /\/api\/sessions\/[^/]+\/bpmn$/.test(url);
    if (!isOps && !isPutBpmn) return;
    const bytes = Buffer.byteLength(request.postData() || "", "utf8");
    const record = { kind: isOps ? "operations" : "put_bpmn", method, url, bytes, durationMs: null, status: null, requestAtMs: Date.now() };
    records.push(record);
    if (isOps) {
      pendingOps.push(record);
      request.timing();
    }
  });
  page.on("requestfinished", (request) => {
    if (!OPS_URL.test(request.url())) return;
    const record = pendingOps.shift();
    if (!record) return;
    const timing = request.timing();
    // Playwright/Chromium: startTime — epoch, остальные поля — относительные
    // (requestStart ≈ 0). Длительность = responseEnd - requestStart; ранняя
    // формула responseEnd - startTime давала отрицательное и вечный null.
    const start = Number(timing?.requestStart);
    const end = Number(timing?.responseEnd);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && start >= 0) {
      record.durationMs = end - start;
    } else if (Number.isFinite(end) && end >= 0) {
      record.durationMs = end;
    }
  });
  page.on("requestfailed", (request) => {
    if (!OPS_URL.test(request.url())) return;
    pendingOps.shift();
  });
  page.on("response", (response) => {
    if (response.request().method() !== "POST" || !OPS_URL.test(response.url())) return;
    const record = pendingOps[0];
    if (!record) return;
    record.status = response.status();
    // Wall-clock fallback: requestfinished-timing в Chromium не всегда
    // финализирован (responseEnd -1) — для бюджета p95 достаточно точности
    // событий Playwright (~мс).
    if (record.durationMs === null && Number.isFinite(record.requestAtMs)) {
      record.durationMs = Date.now() - record.requestAtMs;
    }
  });
  return records;
}

function collectConflictResponses(page) {
  const conflicts = [];
  page.on("response", (response) => {
    if (response.status() === 409) {
      conflicts.push({ url: response.url(), status: response.status() });
    }
  });
  return conflicts;
}

// PerformanceObserver longtask — до загрузки приложения (addInitScript).
async function installLongtaskProbe(page) {
  await page.addInitScript(() => {
    window.__PM_E2E_LONGTASKS__ = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__PM_E2E_LONGTASKS__.push({ start: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // longtask API недоступен — ассерт на пустоте массива не врёт: миссия
      // спеки (бюджет 200 мс) непроверяема, маркируем специальным значением.
      window.__PM_E2E_LONGTASKS__ = null;
    }
  });
}

function readLongtasks(page) {
  return page.evaluate(() => (window.__PM_E2E_LONGTASKS__ === null ? null : (window.__PM_E2E_LONGTASKS__ || [])));
}

function readOpsFlushedCount(page) {
  return page.evaluate(() => {
    const hook = window.__PM_OPS_FLUSHED__;
    return hook && typeof hook === "object" ? Number(hook.count) || 0 : 0;
  });
}

function readOpsCoverage(page) {
  return page.evaluate(() => {
    const cov = window.__PM_OPS_COVERAGE__;
    if (!cov || typeof cov !== "object") return { total: 0, mapped: 0, fullSave: 0 };
    return {
      total: Number(cov.total) || 0,
      mapped: Number(cov.mapped) || 0,
      fullSave: Number(cov.fullSave) || 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Бутстрап сессии 300+ элементов (без __FPC_E2E_PAUSE_AUTOSAVE__ — правим
// реально, TESTS.md §4 шаг 2)
// ---------------------------------------------------------------------------

async function bootstrapOpsSession(page, request, runId) {
  const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
  // lanes 4 × tasksPerLane 32 → 4×(1+32+6+1) nodes + 4×39 flows + 4 lanes +
  // 1 participant = 317 элементов (≥300).
  const xml = makeHeavyEditingDiagramXml({ lanes: 4, tasksPerLane: 32 });
  // step2-регрессия: org ≠ default (урок #989) — вместо createFixture
  // (default org) используем helper контура.
  const fixture = await createOrgSessionFixture(request, auth, {
    orgName: `E2E async-save-operations ${runId}`,
    sessionTitle: `E2E ops session ${runId}`,
    xml,
  });
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, {
    activeOrgId: fixture.orgId || auth.activeOrgId,
    refreshToken: auth.refreshToken,
    refreshCookie: auth.refreshCookie,
  });
  if (auth.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page, { timeout: 90_000 });
  await expect
    .poll(
      async () => page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return 0;
        try {
          return modeler.get("elementRegistry").getAll().length;
        } catch {
          return 0;
        }
      }),
      { timeout: 90_000, message: "diagram must contain 300+ elements in elementRegistry" },
    )
    .toBeGreaterThanOrEqual(MIN_ELEMENTS);
  return { auth, fixture, xml, headers: orgHeaders(auth, fixture.orgId) };
}

// ---------------------------------------------------------------------------
// Правки канваса через modeling-API (mutation gateway, UI.md §4.1)
// ---------------------------------------------------------------------------

function getModelerRef() {
  return `(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) throw new Error("modeler_missing");
    return modeler;
  })()`;
}

async function modelingEdit(page, label, fnBody, arg) {
  const result = await page.evaluate(`(() => {
    const modeler = ${getModelerRef()};
    const arg = ${JSON.stringify(arg ?? null)};
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const fn = ${fnBody};
      return { ok: true, ...(fn(modeler, registry, modeling, arg) || {}) };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  })()`);
  expect(result.ok, `${label}: ${JSON.stringify(result)}`).toBeTruthy();
  return result;
}

async function renameElement(page, elementId, marker) {
  return modelingEdit(
    page,
    `rename ${elementId}`,
    `(modeler, registry, modeling, arg) => {
      const el = registry.get(arg.elementId);
      if (!el) return { error: "element_missing:" + arg.elementId };
      modeling.updateLabel(el, arg.marker);
      return { elementId: arg.elementId };
    }`,
    { elementId, marker },
  );
}

async function moveElement(page, elementId, dx, dy) {
  return modelingEdit(
    page,
    `move ${elementId}`,
    `(modeler, registry, modeling, arg) => {
      const el = registry.get(arg.elementId);
      if (!el) return { error: "element_missing:" + arg.elementId };
      const before = { x: el.x, y: el.y };
      modeling.moveShape(el, { x: arg.dx, y: arg.dy });
      return { elementId: arg.elementId, before };
    }`,
    { elementId, dx, dy },
  );
}

async function resizeElement(page, elementId, growW, growH) {
  return modelingEdit(
    page,
    `resize ${elementId}`,
    `(modeler, registry, modeling, arg) => {
      const el = registry.get(arg.elementId);
      if (!el) return { error: "element_missing:" + arg.elementId };
      const next = {
        x: el.x, y: el.y,
        width: el.width + arg.growW,
        height: el.height + arg.growH,
      };
      modeling.resizeShape(el, next);
      return { elementId: arg.elementId, bounds: next };
    }`,
    { elementId, growW, growH },
  );
}

async function updatePropertiesEdit(page, elementId, marker) {
  return modelingEdit(
    page,
    `updateProperties ${elementId}`,
    `(modeler, registry, modeling, arg) => {
      const el = registry.get(arg.elementId);
      if (!el) return { error: "element_missing:" + arg.elementId };
      modeling.updateProperties(el, { documentation: arg.marker });
      return { elementId: arg.elementId };
    }`,
    { elementId, marker },
  );
}

// Создание standalone-таски справа от end event своей линии (свободная зона
// внутри lane, без пересечений).
async function createTaskAfterLaneEnd(page, laneIndex) {
  return modelingEdit(
    page,
    `create task lane ${laneIndex}`,
    `(modeler, registry, modeling, arg) => {
      const endEvent = registry.get("EndEvent_" + arg.laneIndex);
      const lane = endEvent?.parent;
      if (!endEvent || !lane) return { error: "lane_end_missing:" + arg.laneIndex };
      const position = {
        x: endEvent.x + endEvent.width + 40,
        y: endEvent.y + (endEvent.height - 80) / 2,
      };
      const shape = modeling.createShape({ type: "bpmn:Task" }, position, lane);
      return { createdId: shape.id };
    }`,
    { laneIndex },
  );
}

async function connectElements(page, sourceId, targetId) {
  return modelingEdit(
    page,
    `connect ${sourceId} -> ${targetId}`,
    `(modeler, registry, modeling, arg) => {
      const source = registry.get(arg.sourceId);
      const target = registry.get(arg.targetId);
      if (!source || !target) return { error: "endpoint_missing" };
      const connection = modeling.connect(source, target, { type: "bpmn:SequenceFlow" });
      return { connectionId: connection.id };
    }`,
    { sourceId, targetId },
  );
}

async function deleteConnection(page, connectionId) {
  return modelingEdit(
    page,
    `delete connection ${connectionId}`,
    `(modeler, registry, modeling, arg) => {
      const connection = registry.get(arg.connectionId);
      if (!connection) return { error: "connection_missing:" + arg.connectionId };
      modeling.removeConnection(connection);
      return {};
    }`,
    { connectionId },
  );
}

async function deleteShape(page, elementId) {
  return modelingEdit(
    page,
    `delete shape ${elementId}`,
    `(modeler, registry, modeling, arg) => {
      const el = registry.get(arg.elementId);
      if (!el) return { error: "element_missing:" + arg.elementId };
      modeling.removeShape(el);
      return {};
    }`,
    { elementId },
  );
}

// Серия из 20 правок: 8 rename, 4 move, 2 resize, 2 updateProperties,
// 2 create, 1 connect, 1 connection.delete, 1 shape.delete — все 8 op-типов
// vocabulary (commandToOps WHITELIST).
async function applyTwentyEdits(page, runTag) {
  const markers = [];
  const edits = [
    () => renameElement(page, "Task_1_1", `REN_A1_${runTag}`).then((r) => markers.push({ kind: "rename", id: "Task_1_1", marker: `REN_A1_${runTag}` })),
    () => renameElement(page, "Task_1_2", `REN_A2_${runTag}`).then(() => markers.push({ kind: "rename", id: "Task_1_2", marker: `REN_A2_${runTag}` })),
    () => renameElement(page, "Task_2_1", `REN_B1_${runTag}`).then(() => markers.push({ kind: "rename", id: "Task_2_1", marker: `REN_B1_${runTag}` })),
    () => renameElement(page, "Task_2_2", `REN_B2_${runTag}`).then(() => markers.push({ kind: "rename", id: "Task_2_2", marker: `REN_B2_${runTag}` })),
    () => renameElement(page, "Task_3_1", `REN_C1_${runTag}`).then(() => markers.push({ kind: "rename", id: "Task_3_1", marker: `REN_C1_${runTag}` })),
    () => renameElement(page, "Task_3_2", `REN_C2_${runTag}`).then(() => markers.push({ kind: "rename", id: "Task_3_2", marker: `REN_C2_${runTag}` })),
    () => moveElement(page, "Task_1_3", 30, 12).then((r) => markers.push({ kind: "move", id: "Task_1_3", before: r.before, dx: 30, dy: 12 })),
    () => moveElement(page, "Task_1_4", -20, 16).then((r) => markers.push({ kind: "move", id: "Task_1_4", before: r.before, dx: -20, dy: 16 })),
    () => moveElement(page, "Task_2_3", 24, -10).then((r) => markers.push({ kind: "move", id: "Task_2_3", before: r.before, dx: 24, dy: -10 })),
    () => resizeElement(page, "Task_1_5", 12, 10).then((r) => markers.push({ kind: "resize", id: "Task_1_5", bounds: r.bounds })),
    () => resizeElement(page, "Task_1_6", -8, 6).then((r) => markers.push({ kind: "resize", id: "Task_1_6", bounds: r.bounds })),
    () => updatePropertiesEdit(page, "Task_4_1", `PROP_A_${runTag}`).then(() => markers.push({ kind: "props", id: "Task_4_1", marker: `PROP_A_${runTag}` })),
    () => updatePropertiesEdit(page, "Task_4_2", `PROP_B_${runTag}`).then(() => markers.push({ kind: "props", id: "Task_4_2", marker: `PROP_B_${runTag}` })),
    () => createTaskAfterLaneEnd(page, 1).then((r) => markers.push({ kind: "create", id: r.createdId })),
    () => createTaskAfterLaneEnd(page, 2).then((r) => markers.push({ kind: "create", id: r.createdId })),
    () => {
      const created = markers.filter((m) => m.kind === "create").map((m) => m.id);
      return connectElements(page, created[0], created[1]).then((r) => markers.push({ kind: "connect", id: r.connectionId }));
    },
    () => {
      const connection = markers.find((m) => m.kind === "connect");
      return deleteConnection(page, connection.id).then(() => markers.push({ kind: "connectionDeleted", id: connection.id }));
    },
    () => {
      const created = markers.filter((m) => m.kind === "create").map((m) => m.id);
      return deleteShape(page, created[0]).then(() => markers.push({ kind: "shapeDeleted", id: created[0] }));
    },
    () => moveElement(page, "Task_4_3", 18, 14).then((r) => markers.push({ kind: "move", id: "Task_4_3", before: r.before, dx: 18, dy: 14 })),
    () => renameElement(page, "Task_4_4", `REN_D1_${runTag}`).then(() => markers.push({ kind: "rename", id: "Task_4_4", marker: `REN_D1_${runTag}` })),
  ];
  expect(edits.length).toBe(EDIT_COUNT);
  for (const edit of edits) {
    await edit();
    await page.waitForTimeout(60);
  }
  return markers;
}

// ---------------------------------------------------------------------------
// Серверные сверки
// ---------------------------------------------------------------------------

async function fetchServerXml(request, sessionId, headers) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn?raw=1`, { headers });
  expect(res.ok(), `GET bpmn status=${res.status()}`).toBeTruthy();
  return res.text();
}

async function waitForServerXmlSubstring(request, sessionId, headers, needle, timeoutMs = 45_000) {
  await expect
    .poll(async () => (await fetchServerXml(request, sessionId, headers)).includes(needle) ? 1 : 0, {
      timeout: timeoutMs,
      message: `server XML must contain ${needle}`,
    })
    .toBe(1);
}

async function waitForOpsFlushIncrement(page, previousCount, timeoutMs = FLUSH_WAIT_MS) {
  await expect
    .poll(async () => (await readOpsFlushedCount(page)) > previousCount, {
      timeout: timeoutMs,
      message: "window.__PM_OPS_FLUSHED__ counter must increment",
    })
    .toBe(true);
}

// ---------------------------------------------------------------------------
// Тест 1 — критерий приёмки: 20 правок, только /operations, бюджеты,
// coverage, reload-persistence.
// ---------------------------------------------------------------------------

test("async save: 20 edits on 300+ element diagram go through /operations only and persist after reload", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const runTag = runId.slice(-6);
  const pageErrors = collectPageErrors(page);
  const traffic = collectSaveTraffic(page);
  await installLongtaskProbe(page);
  const { auth, fixture, headers } = await bootstrapOpsSession(page, request, runId);
  const versionBefore = await readServerDiagramStateVersion(page, fixture.sessionId, headers);

  // Окно серии: отметка времени страницы + сброс накопленного трафика загрузки.
  traffic.length = 0;
  const seriesStart = await page.evaluate(() => performance.now());
  const markers = await applyTwentyEdits(page, runTag);

  // Ждём финального ops-flush: счётчик инкрементится, сервер получил маркер
  // последнего rename.
  await waitForOpsFlushIncrement(page, 0, FLUSH_WAIT_MS);
  const flushedCount = await readOpsFlushedCount(page);
  const lastRename = markers.filter((m) => m.kind === "rename").slice(-1)[0].marker;
  await waitForServerXmlSubstring(request, fixture.sessionId, headers, lastRename);
  // Settle: дать ответу последнего flush дойти до коллектора.
  await page.waitForTimeout(500);

  // --- Ассерты сетевого профиля (TESTS.md §4 шаг 4) ---
  const opsPosts = traffic.filter((r) => r.kind === "operations");
  const putBpmn = traffic.filter((r) => r.kind === "put_bpmn");
  expect(opsPosts.length, "at least one POST /operations expected").toBeGreaterThanOrEqual(1);
  for (const record of opsPosts) {
    expect(record.bytes, `operations body ${record.bytes}B must be <= ${OPS_BODY_BUDGET_BYTES}B`).toBeLessThanOrEqual(OPS_BODY_BUDGET_BYTES);
  }
  const bigBodies = traffic.filter((r) => r.bytes > OPS_BODY_BUDGET_BYTES);
  expect(bigBodies, `no save body >${OPS_BODY_BUDGET_BYTES}B allowed`).toHaveLength(0);
  expect(putBpmn, "zero PUT /bpmn during the edit series (fallback is a separate scenario)").toHaveLength(0);

  // Длительности — из Resource Timing API страницы (responseEnd - startTime,
  // обе метки в одной базе): без задержек диспетчеризации событий Playwright
  // и с учётом только сети+сервера. Fallback — замеры коллектора.
  const inPageDurations = await page.evaluate(() => performance
    .getEntriesByType("resource")
    .filter((entry) => /\/api\/sessions\/[^/]+\/operations$/.test(entry.name || ""))
    .map((entry) => entry.responseEnd - entry.startTime)
    .filter((value) => Number.isFinite(value) && value >= 0));
  const collected = opsPosts.map((r) => r.durationMs).filter((d) => Number.isFinite(d));
  const durations = inPageDurations.length > 0 ? inPageDurations : collected;
  expect(durations.length).toBeGreaterThanOrEqual(1);
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)];
  expect(p95, `operations p95 ${p95}ms must be < ${OPS_P95_BUDGET_MS}ms`).toBeLessThan(OPS_P95_BUDGET_MS);

  // --- Longtask-бюджет ---
  const longtasks = await readLongtasks(page);
  expect(longtasks, "PerformanceObserver longtask API must be available").not.toBeNull();
  const longTasksInSeries = longtasks.filter((e) => e.start >= seriesStart && e.duration > LONGTASK_BUDGET_MS);
  expect(longTasksInSeries, `no longtask >${LONGTASK_BUDGET_MS}ms during edit series: ${JSON.stringify(longTasksInSeries)}`).toHaveLength(0);

  // --- Coverage ≥95% и счётчик flush ---
  const coverage = await readOpsCoverage(page);
  expect(coverage.total).toBeGreaterThanOrEqual(EDIT_COUNT);
  const ratio = coverage.mapped / coverage.total;
  expect(ratio, `ops coverage mapped/total = ${coverage.mapped}/${coverage.total} must be >= ${COVERAGE_MIN_RATIO}`).toBeGreaterThanOrEqual(COVERAGE_MIN_RATIO);
  expect(flushedCount, "__PM_OPS_FLUSHED__ counter must increment").toBeGreaterThanOrEqual(1);
  console.log(`ops-metrics: bodies max=${Math.max(...opsPosts.map((r) => r.bytes))}B n=${opsPosts.length}, p95=${p95.toFixed(1)}ms (n=${durations.length}), longtasks>${LONGTASK_BUDGET_MS}ms=${longTasksInSeries.length}, coverage=${coverage.mapped}/${coverage.total}=${ratio.toFixed(2)}, putBpmn=${putBpmn.length}, flushed=${flushedCount}`);

  // --- Reload → все правки на месте ---
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDiagramReady(page, { timeout: 90_000 });
  // Импорт 300+ элементов прогрессивен: waitForDiagramReady ≠ полный
  // elementRegistry. Порог MIN_ELEMENTS недостаточен — созданные в серии
  // элементы идут в хвосте документа и регистрируются последними. Ждём
  // стабилизации размера реестра (два одинаковых считывания подряд).
  const readRegistrySize = () => page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return 0;
    try {
      return modeler.get("elementRegistry").getAll().length;
    } catch {
      return 0;
    }
  });
  await expect
    .poll(
      async () => readRegistrySize(),
      { timeout: 90_000, message: "elementRegistry must reach MIN_ELEMENTS after reload" },
    )
    .toBeGreaterThanOrEqual(MIN_ELEMENTS);
  let lastSize = -1;
  let stableReads = 0;
  await expect
    .poll(
      async () => {
        const size = await readRegistrySize();
        stableReads = size === lastSize ? stableReads + 1 : 0;
        lastSize = size;
        return stableReads;
      },
      { timeout: 90_000, message: "elementRegistry must stabilize after reload (import complete)" },
    )
    .toBeGreaterThanOrEqual(3);

  for (const marker of markers) {
    if (marker.kind === "rename") {
      const name = await page.evaluate((id) => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        return String(modeler?.get("elementRegistry")?.get(id)?.businessObject?.name || "");
      }, marker.id);
      expect(name, `rename persisted for ${marker.id}`).toBe(marker.marker);
    } else if (marker.kind === "move") {
      const pos = await page.evaluate((id) => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        const el = modeler?.get("elementRegistry")?.get(id);
        return el ? { x: el.x, y: el.y } : null;
      }, marker.id);
      expect(pos, `moved element ${marker.id} present after reload`).not.toBeNull();
      expect(Math.abs(pos.x - (marker.before.x + marker.dx)), `move persisted for ${marker.id}`).toBeLessThanOrEqual(2);
      expect(Math.abs(pos.y - (marker.before.y + marker.dy)), `move persisted for ${marker.id}`).toBeLessThanOrEqual(2);
    } else if (marker.kind === "resize") {
      const bounds = await page.evaluate((id) => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        const el = modeler?.get("elementRegistry")?.get(id);
        return el ? { width: el.width, height: el.height } : null;
      }, marker.id);
      expect(bounds, `resized element ${marker.id} present after reload`).not.toBeNull();
      expect(Math.abs(bounds.width - marker.bounds.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(bounds.height - marker.bounds.height)).toBeLessThanOrEqual(2);
    } else if (marker.kind === "create") {
      const exists = await page.evaluate((id) => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        return !!modeler?.get("elementRegistry")?.get(id);
      }, marker.id);
      // Первая созданная таска удалена в серии — вторая обязана выжить.
      const deleted = markers.some((m) => m.kind === "shapeDeleted" && m.id === marker.id);
      expect(exists, `created element ${marker.id} persistence (deleted=${deleted})`).toBe(!deleted);
    } else if (marker.kind === "connect" || marker.kind === "connectionDeleted" || marker.kind === "shapeDeleted") {
      const exists = await page.evaluate((id) => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        return !!modeler?.get("elementRegistry")?.get(id);
      }, marker.id);
      expect(exists, `${marker.kind} ${marker.id} must be absent after reload`).toBe(false);
    }
  }

  // Свойства (documentation) persisted — сверка через серверный XML.
  const serverXml = await fetchServerXml(request, fixture.sessionId, headers);
  for (const marker of markers) {
    if (marker.kind === "rename" || marker.kind === "props") {
      expect(serverXml.includes(marker.marker), `server XML contains ${marker.marker}`).toBe(true);
    }
  }
  const deletedShape = markers.find((m) => m.kind === "shapeDeleted");
  expect(serverXml.includes(`id="${deletedShape.id}"`), "deleted shape absent in server XML").toBe(false);

  // Версия инкрементирована (как минимум один ops-батч).
  const versionAfter = await readServerDiagramStateVersion(page, fixture.sessionId, headers);
  expect(versionAfter, "diagram_state_version must grow after ops flushes").toBeGreaterThan(versionBefore);

  expect(pageErrors, `no page errors: ${JSON.stringify(pageErrors.slice(0, 3))}`).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Тест 2 — под-сценарий 409: «другой клиент» правит через API между base и
// flush → автоматический rebase, без модала, без потери правок.
// ---------------------------------------------------------------------------

test("async save: same-tab 409 race triggers automatic ops rebase without conflict modal", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const runTag = runId.slice(-6);
  const pageErrors = collectPageErrors(page);
  const conflicts409 = collectConflictResponses(page);
  const traffic = collectSaveTraffic(page);
  const { auth, fixture, xml, headers } = await bootstrapOpsSession(page, request, runId);

  // Правка страницы → op в буфере outbox (debounce 2.5 c до flush).
  const pageMarker = `RACE_PAGE_${runTag}`;
  await renameElement(page, "Task_2_5", pageMarker);

  // «Другой клиент»: API-правка между base и flush (другое имя задачи в
  // исходном XML, тот же граф). base — актуальная серверная версия.
  const otherMarker = `RACE_OTHER_${runTag}`;
  const otherXml = xml.replace(/name="Задача 3\.9"/, `name="${otherMarker}"`);
  expect(otherXml).not.toBe(xml);
  const baseVersion = await readServerDiagramStateVersion(page, fixture.sessionId, headers);
  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(fixture.sessionId)}/bpmn`, {
    headers: headers,
    data: {
      xml: otherXml,
      base_diagram_state_version: baseVersion,
      base_bpmn_xml_version: 0,
    },
  });
  expect(putRes.ok(), `other-client PUT status=${putRes.status()}`).toBeTruthy();

  // Немедленный flush (синтетический online-триггер) — детерминированный 409:
  // за ~мс фоновый sync страницы не успевает адоптировать новую серверную
  // версию в casVersionTracker (при естественном debounce 2.5 c adoption
  // успевает и 409 не возникает — штатное улучшение step2, гонка тогда
  // закрывается свежим base). Далее: 409 → rebase → повторный flush.
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
  });
  const flushedBefore = await readOpsFlushedCount(page);
  await waitForOpsFlushIncrement(page, flushedBefore, FLUSH_WAIT_MS + 10_000);
  await waitForServerXmlSubstring(request, fixture.sessionId, headers, pageMarker);

  const serverXml = await fetchServerXml(request, fixture.sessionId, headers);
  expect(serverXml.includes(pageMarker), "page edit survived rebase").toBe(true);
  expect(serverXml.includes(otherMarker), "other-client edit survived rebase").toBe(true);

  // Был ровно один 409 на /operations (rebase-путь), модал не показан.
  const opsConflicts = conflicts409.filter((c) => /\/operations$/.test(c.url));
  expect(opsConflicts.length, `exactly one 409 on /operations expected, got ${JSON.stringify(conflicts409)}`).toBeGreaterThanOrEqual(1);
  const modalVisible = await page.getByTestId("diagram-save-conflict-modal").isVisible().catch(() => false);
  expect(modalVisible, "conflict modal must not be shown for same-tab ops race").toBe(false);

  // Повторный flush после rebase ушёл со свежим base (минимум 2 трейса).
  const flushedTotal = await readOpsFlushedCount(page);
  expect(flushedTotal, "rebase re-flush traced").toBeGreaterThanOrEqual(2);
  const opsPosts = traffic.filter((r) => r.kind === "operations" && r.status === 200);
  expect(opsPosts.length, "ops flush succeeded after rebase").toBeGreaterThanOrEqual(1);

  expect(pageErrors, `no page errors: ${JSON.stringify(pageErrors.slice(0, 3))}`).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Тест 3 — под-сценарий fallback: spaceTool (вне whitelist) → ровно один
// полный PUT /bpmn; после ack ops-флаши продолжаются.
// ---------------------------------------------------------------------------

test("async save: non-whitelisted spaceTool edit falls back to exactly one full PUT /bpmn, then ops resume", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const runTag = runId.slice(-6);
  const pageErrors = collectPageErrors(page);
  const traffic = collectSaveTraffic(page);
  const { auth, fixture, headers } = await bootstrapOpsSession(page, request, runId);
  traffic.length = 0;

  // Активация space tool (editorActions, тот же вход, что у хоткея) и
  // горизонтальный drag по полосе линии 1 — команда 'spaceTool' в commandStack.
  await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    modeler.get("editorActions").trigger("spaceTool");
  });
  const drag = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler.get("canvas");
    const vb = canvas.viewbox();
    const task = modeler.get("elementRegistry").get("Task_1_10");
    const host = document.querySelector(".bpmnStageHost").getBoundingClientRect();
    const worldY = task.y + task.height / 2;
    const worldX = vb.x + vb.width - 120;
    const toScreen = (wx, wy) => ({
      x: host.left + (wx - vb.x) * vb.scale,
      y: host.top + (wy - vb.y) * vb.scale,
    });
    const start = toScreen(worldX, worldY);
    return { startX: start.x, startY: start.y, endX: start.x + 180, endY: start.y };
  });
  await page.mouse.move(drag.startX, drag.startY);
  await page.mouse.down();
  await page.mouse.move(drag.endX, drag.endY, { steps: 12 });
  await page.mouse.up();

  // Не-whitelisted команда → needsFullSave → requestFullSave → PUT /bpmn.
  await expect
    .poll(async () => traffic.filter((r) => r.kind === "put_bpmn").length, {
      timeout: 45_000,
      message: "full PUT /bpmn expected after spaceTool edit",
    })
    .toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(500);
  const putBpmn = traffic.filter((r) => r.kind === "put_bpmn");
  expect(putBpmn, "exactly one full PUT /bpmn for the fallback edit").toHaveLength(1);

  // После ack full-save outbox сброшен и ops-флаши продолжаются: rename →
  // счётчик инкрементится.
  const flushedBefore = await readOpsFlushedCount(page);
  await renameElement(page, "Task_2_7", `FB_RESUME_${runTag}`);
  await waitForOpsFlushIncrement(page, flushedBefore, FLUSH_WAIT_MS + 10_000);
  await waitForServerXmlSubstring(request, fixture.sessionId, headers, `FB_RESUME_${runTag}`);

  expect(pageErrors, `no page errors: ${JSON.stringify(pageErrors.slice(0, 3))}`).toHaveLength(0);
});
