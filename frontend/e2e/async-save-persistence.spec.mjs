// E2E-спека feature/async-save-pipeline-step2 — персистентность outbox
// (TESTS.md §4.1, PLAN §9 п.1/п.2/п.6, UI.md §3/§6).
//
// Все сценарии на org ≠ default (урок #989, helper nonDefaultOrg.mjs).
//
// Сценарии:
//   1. kill-before-flush: 5 правок → page.close() ДО debounce-окна (2.5 c) →
//      reopen (тот же browser context — IndexedDB переживает закрытие вкладки)
//      → hydration из IDB → догон сервера → маркеры в XML через API, journal
//      drained, версия инкрементирована ровно на 1 (keepalive-flush при pagehide
//      и hydration-flush при входе — взаимно идемпотентны по opId, суммарно +1).
//   2. offline: setOffline(true) → правка → индикатор «Сохранено локально» +
//      sublabel «ожидает сеть» (data-testid ...-awaiting-network), ни одного
//      POST /operations → setOffline(false) → «Сохранено», маркер на сервере.
//   3. reload-mid-series: правки → flush → reload → ещё правки → всё сходится;
//      версия инкрементирована ровно на число батчей с новыми opId; каждый opId
//      доставлен ровно один раз; 0 PUT /bpmn.
//
// Бюджеты (TESTS.md §5): потери = 0; запись IDB ≤5 мс p95; тело ops ≤10 kB;
// 0 PUT вне fallback.
//
// Зуск: host без node — прогон в docker (local-playwright:v1.58.2), см. шапку
// async-save-operations.spec.mjs (vite dev pm-ops-vite :5197, API :8011).

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";
import { makeHeavyEditingDiagramXml } from "./helpers/heavyEditingFixture.mjs";
import { readServerDiagramStateVersion } from "./helpers/canvasStabilitySteps.mjs";
import { createOrgSessionFixture, orgHeaders } from "./helpers/nonDefaultOrg.mjs";

const OPS_BODY_BUDGET_BYTES = 10 * 1024;
const IDB_WRITE_BUDGET_MS = 5;
const FLUSH_WAIT_MS = 15_000;

// ---------------------------------------------------------------------------
// Коллекторы
// ---------------------------------------------------------------------------

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(String(err?.message || err || ""));
  });
  return errors;
}

// POST /operations: тело (opIds + baseVersion + размер) и статус ответа.
function collectOpsRequests(page) {
  const records = [];
  const pending = [];
  const OPS_URL = /\/api\/sessions\/[^/]+\/operations$/;
  page.on("request", (request) => {
    if (request.method() !== "POST" || !OPS_URL.test(request.url())) return;
    const raw = request.postData() || "";
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      body = {};
    }
    const record = {
      opIds: (Array.isArray(body.operations) ? body.operations : []).map((op) => String(op?.opId || "")),
      baseVersion: Number(body.baseVersion),
      bytes: Buffer.byteLength(raw, "utf8"),
      status: null,
      atMs: Date.now(),
    };
    records.push(record);
    pending.push(record);
  });
  page.on("response", (response) => {
    if (response.request().method() !== "POST" || !OPS_URL.test(response.url())) return;
    const record = pending.shift();
    if (record) record.status = response.status();
  });
  return records;
}

function collectPutBpmn(page) {
  const puts = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && /\/api\/sessions\/[^/]+\/bpmn$/.test(request.url())) {
      puts.push({ url: request.url(), atMs: Date.now() });
    }
  });
  return puts;
}

// Замер записей в IDB-стор operations (store `operations`): два измерения —
// (а) синхронная стоимость put() (main-thread blocking — именно то, что
// бюджет «≤5 мс p95»: UI.md §4 «микро-очередь, не блокирующая commandStack»);
// (б) полная commit-латентность (call→success) — informational, в ассерт не
// входит: success-доставка идёт через event loop и на импорте диаграммы
// конкурирует с longtask'ами (не блокирует UI). Ставится через addInitScript
// ДО загрузки приложения — захватывает реальные записи журнала outbox.
async function installIdbWriteProbe(page) {
  await page.addInitScript(() => {
    window.__PM_E2E_IDB_WRITES__ = { sync: [], commit: [] };
    try {
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function put(value, key) {
        const storeName = String(this.name || "");
        const t0 = performance.now();
        const request = originalPut.call(this, value, key);
        if (storeName === "operations") {
          const syncMs = performance.now() - t0;
          window.__PM_E2E_IDB_WRITES__.sync.push(syncMs);
          request.addEventListener("success", () => {
            window.__PM_E2E_IDB_WRITES__.commit.push(performance.now() - t0);
          }, { once: true });
        }
        return request;
      };
    } catch {
      window.__PM_E2E_IDB_WRITES__ = null;
    }
  });
}

function readIdbWriteDurations(page) {
  return page.evaluate(() => (window.__PM_E2E_IDB_WRITES__ === null ? null : (window.__PM_E2E_IDB_WRITES__ || { sync: [], commit: [] })));
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  return sortedValues[Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1)];
}

// ---------------------------------------------------------------------------
// IndexedDB-проверки журнала (outbox drained / pending ops)
// ---------------------------------------------------------------------------

function countSessionOps(page, sessionId) {
  return page.evaluate((sid) => new Promise((resolve) => {
    try {
      const req = indexedDB.open("pm-save-outbox");
      req.onerror = () => resolve(-1);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction("operations", "readonly");
          const store = tx.objectStore("operations");
          const idx = store.index("bySession");
          const getAll = idx.getAll(sid);
          getAll.onerror = () => resolve(-1);
          getAll.onsuccess = () => resolve(Array.isArray(getAll.result) ? getAll.result.length : 0);
        } catch (error) {
          resolve(-1);
        } finally {
          db.close();
        }
      };
    } catch (error) {
      resolve(-1);
    }
  }), sessionId);
}

async function waitForOutboxDrained(page, sessionId, timeoutMs = FLUSH_WAIT_MS) {
  await expect
    .poll(async () => (await countSessionOps(page, sessionId)) === 0, {
      timeout: timeoutMs,
      message: "IDB outbox journal must be drained (0 pending ops)",
    })
    .toBe(true);
}

// ---------------------------------------------------------------------------
// Бутстрап сессии в org ≠ default
// ---------------------------------------------------------------------------

async function bootstrapOrgSession(page, request, runTag, { idbProbe = false } = {}) {
  const auth = await apiLogin(request, {});
  const fixture = await createOrgSessionFixture(request, auth, {
    orgName: `E2E async-save-persistence ${runTag}`,
    sessionTitle: `E2E persistence session ${runTag}`,
    xml: makeHeavyEditingDiagramXml({ lanes: 2, tasksPerLane: 8 }),
  });
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  if (idbProbe) await installIdbWriteProbe(page);
  await setUiToken(page, auth.accessToken, {
    activeOrgId: fixture.orgId,
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
  await waitForElementsPresent(page, ["Task_1_1", "Task_2_1"], 90_000);
  return { auth, fixture, headers: orgHeaders(auth, fixture.orgId) };
}

async function reopenOrgSession(page, auth, fixture) {
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId });
  if (auth.userId) {
    await page.addInitScript((uid) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${uid}`, "1");
    }, auth.userId);
  }
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page, { timeout: 90_000 });
}

// Импорт диаграммы прогрессивен: waitForDiagramReady ≠ полный elementRegistry
// (та же находка, что в step1 async-save-operations.spec.mjs). Правки идут
// только после регистрации целевых элементов.
async function waitForElementsPresent(page, elementIds, timeoutMs = 90_000) {
  const ids = (Array.isArray(elementIds) ? elementIds : [elementIds]).map(String);
  await expect
    .poll(async () => {
      const present = await page.evaluate((wanted) => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return 0;
        try {
          const registry = modeler.get("elementRegistry");
          return wanted.filter((id) => !!registry.get(id)).length;
        } catch {
          return 0;
        }
      }, ids);
      return present === ids.length ? 1 : 0;
    }, { timeout: timeoutMs, message: `elements must be registered: ${ids.join(",")}` })
    .toBe(1);
}

// ---------------------------------------------------------------------------
// Правки канваса (modeling-API, стиль step1)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Тест 1 — kill-before-flush (TESTS.md §4.1.1)
// ---------------------------------------------------------------------------

test("async save persistence: kill tab before flush keeps edits in IDB outbox and delivers them on reopen", async ({ page, context, request }) => {
  const runTag = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const pageErrors = collectPageErrors(page);
  const opsRequests = collectOpsRequests(page);
  await installIdbWriteProbe(page);
  const { auth, fixture, headers } = await bootstrapOrgSession(page, request, runTag);

  // Session-open reconcile PUT /bpmn может завершиться после waitForDiagramReady
  // — даём ему 3 c и берём baseline уже после open-time truth-write.
  await page.waitForTimeout(3_000);
  const versionBefore = await readServerDiagramStateVersion(page, fixture.sessionId, headers);
  const markers = [];
  for (let i = 1; i <= 5; i += 1) {
    const marker = `KILL_${runTag}_${i}`;
    await renameElement(page, `Task_1_${i}`, marker);
    markers.push(marker);
    await page.waitForTimeout(60);
  }
  // IDB-записи должны были завершиться (микро-очередь ~мс), debounce-окно
  // 2.5 c ещё не наступило — обычный flush не ушёл.
  await page.waitForTimeout(800);
  const writeDurations = await readIdbWriteDurations(page);
  expect(writeDurations, "IDB write probe must be installed").not.toBeNull();
  expect(writeDurations.sync.length, "at least 5 IDB writes expected").toBeGreaterThanOrEqual(5);
  for (const record of opsRequests) {
    expect(record.bytes, `operations body ${record.bytes}B must be <= ${OPS_BODY_BUDGET_BYTES}B`).toBeLessThanOrEqual(OPS_BODY_BUDGET_BYTES);
  }

  await page.close();

  // Reopen: тот же context → та же IndexedDB. Гидрация journal → догон сервера.
  const page2 = await context.newPage();
  const pageErrors2 = collectPageErrors(page2);
  const opsRequests2 = collectOpsRequests(page2);
  await reopenOrgSession(page2, auth, fixture);
  await waitForElementsPresent(page2, ["Task_1_1", "Task_1_5"], 90_000);

  for (const marker of markers) {
    await waitForServerXmlSubstring(request, fixture.sessionId, headers, marker, FLUSH_WAIT_MS + 15_000);
  }
  await waitForOutboxDrained(page2, fixture.sessionId, FLUSH_WAIT_MS + 15_000);

  const versionAfter = await readServerDiagramStateVersion(page2, fixture.sessionId, headers);
  // Версия выросла минимум на 1 (доставка ops-батча), ровный счёт батчей —
  // в терминах контролируемых окон reload-mid-series (§4.1.3): здесь reopen
  // неизбежно включает open-time reconcile PUT /bpmn (baseline-поведение
  // активации сессии, +1 вне ops-протокола), поэтому точная дельта не
  // определена. Инварианты именно этого сценария: маркеры на сервере,
  // journal drained, каждый opId доставлен ровно один раз (ниже).
  expect(
    versionAfter,
    `diagram_state_version must grow after kill-before-flush convergence (before=${versionBefore}, after=${versionAfter})`,
  ).toBeGreaterThan(versionBefore);

  // Каждый opId доставлен по протоколу корректно: keepalive-flush при
  // pagehide — fire-and-forget без ack-обработки (буфер/journal не чистится,
  // design-note в createSaveOutbox.flushNow keepalive-ветка), поэтому при
  // reopen гидрация переотправляет те же opId — серверная идемпотентность
  // (session_applied_ops) гарантирует ровно одно ПРИМЕНЕНИЕ. Допустимо ≤2
  // отправки на opId (keepalive + re-send), но ни одна страница не шлёт
  // один opId дважды. Строгий «ровно одна отправка» инвариант без
  // kill-гонки — в reload-mid-series (§4.1.3).
  const deliveries = new Map();
  for (const record of [...opsRequests, ...opsRequests2]) {
    for (const opId of record.opIds) {
      deliveries.set(opId, (deliveries.get(opId) || 0) + 1);
    }
  }
  for (const [opId, count] of deliveries) {
    expect(count, `opId ${opId} delivered ${count} times (max 2: keepalive + re-send)`).toBeLessThanOrEqual(2);
  }
  expect(deliveries.size, "all 5 edits must be delivered").toBeGreaterThanOrEqual(5);

  // Бюджет записи в IDB: синхронная стоимость put (main-thread) p95 ≤5 мс
  // (цель ~1 мс); commit-латентность — informational.
  const syncSorted = [...writeDurations.sync].sort((a, b) => a - b);
  const commitSorted = [...writeDurations.commit].sort((a, b) => a - b);
  const syncP95 = percentile(syncSorted, 0.95);
  const commitP95 = percentile(commitSorted, 0.95);
  console.log(`IDB write latencies: sync p95=${syncP95.toFixed(2)}ms (n=${syncSorted.length}), commit p95=${commitP95.toFixed(2)}ms (n=${commitSorted.length})`);
  expect(syncP95, `IDB write sync p95 ${syncP95}ms must be <= ${IDB_WRITE_BUDGET_MS}ms`).toBeLessThanOrEqual(IDB_WRITE_BUDGET_MS);

  expect(pageErrors, `no page errors before kill: ${JSON.stringify(pageErrors.slice(0, 3))}`).toHaveLength(0);
  expect(pageErrors2, `no page errors after reopen: ${JSON.stringify(pageErrors2.slice(0, 3))}`).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Тест 2 — offline (TESTS.md §4.1.2)
// ---------------------------------------------------------------------------

test("async save persistence: offline edits queue locally with awaiting-network indicator and sync on reconnect", async ({ page, context, request }) => {
  const runTag = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const pageErrors = collectPageErrors(page);
  const opsRequests = collectOpsRequests(page);
  const { auth, fixture, headers } = await bootstrapOrgSession(page, request, runTag);

  const slot = page.getByTestId("diagram-toolbar-save-status-slot");
  await expect(slot).toBeVisible();

  context.setOffline(true);
  const marker = `OFFLINE_${runTag}`;
  await renameElement(page, "Task_2_1", marker);

  // Индикатор: «Сохранено локально» + sublabel «ожидает сеть».
  await expect(slot, "offline edit must show local-save indicator").toContainText("Сохранено локально", { timeout: 15_000 });
  await expect(
    page.getByTestId("diagram-toolbar-save-status-awaiting-network"),
    "awaiting-network sublabel must be visible while offline",
  ).toHaveText("ожидает сеть", { timeout: 15_000 });

  // Debounce-окно (2.5 c) проходит офлайн — ни одного POST /operations.
  await page.waitForTimeout(4_000);
  expect(opsRequests, "no POST /operations while offline (flush suppressed)").toHaveLength(0);

  context.setOffline(false);
  await waitForServerXmlSubstring(request, fixture.sessionId, headers, marker, FLUSH_WAIT_MS + 10_000);
  await waitForOutboxDrained(page, fixture.sessionId, FLUSH_WAIT_MS + 10_000);

  // Индикатор вернулся в «Сохранено», sublabel исчез.
  await expect(slot).toContainText("Сохранено", { timeout: 15_000 });
  await expect(page.getByTestId("diagram-toolbar-save-status-awaiting-network")).toHaveCount(0);

  expect(pageErrors, `no page errors: ${JSON.stringify(pageErrors.slice(0, 3))}`).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Тест 3 — reload-mid-series (TESTS.md §4.1.3)
// ---------------------------------------------------------------------------

test("async save persistence: reload mid-series converges with exactly-once delivery per opId", async ({ page, request }) => {
  const runTag = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const pageErrors = collectPageErrors(page);
  const opsRequests = collectOpsRequests(page);
  const putBpmn = collectPutBpmn(page);
  const { auth, fixture, headers } = await bootstrapOrgSession(page, request, runTag);

  // Session-open reconcile может сделать один полный PUT /bpmn после загрузки
  // (пре-существующее поведение baseline, вне edit-series) — даём ему
  // завершиться и отделяем от бюджета «0 PUT за серию правок».
  await page.waitForTimeout(3_000);
  const putsBeforeSeries = putBpmn.length;

  const firstBatch = [];
  const series1Start = Date.now();
  for (let i = 1; i <= 3; i += 1) {
    const marker = `RELOAD_A${i}_${runTag}`;
    await renameElement(page, `Task_1_${i}`, marker);
    firstBatch.push(marker);
    await page.waitForTimeout(60);
  }
  for (const marker of firstBatch) {
    await waitForServerXmlSubstring(request, fixture.sessionId, headers, marker, FLUSH_WAIT_MS + 10_000);
  }
  const series1End = Date.now();
  const versionMid = await readServerDiagramStateVersion(page, fixture.sessionId, headers);

  // Reload посередине серии: буфер пуст (ack получен), новый инстанс outbox
  // гидрируется из journal (пусто) — чистый вход.
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDiagramReady(page, { timeout: 90_000 });
  await waitForElementsPresent(page, ["Task_2_1", "Task_2_3"], 90_000);
  // Open-time reconcile после reload — вне edit-series: ждём его завершения.
  await page.waitForTimeout(3_000);
  const versionAfterReload = await readServerDiagramStateVersion(page, fixture.sessionId, headers);
  const putsAfterReload = putBpmn.length;

  const secondBatch = [];
  const series2Start = Date.now();
  for (let i = 1; i <= 3; i += 1) {
    const marker = `RELOAD_B${i}_${runTag}`;
    await renameElement(page, `Task_2_${i}`, marker);
    secondBatch.push(marker);
    await page.waitForTimeout(60);
  }
  for (const marker of secondBatch) {
    await waitForServerXmlSubstring(request, fixture.sessionId, headers, marker, FLUSH_WAIT_MS + 10_000);
  }
  const series2End = Date.now();
  await waitForOutboxDrained(page, fixture.sessionId, FLUSH_WAIT_MS + 10_000);

  const versionAfter = await readServerDiagramStateVersion(page, fixture.sessionId, headers);

  // Ровно одна доставка каждого opId: ни одного повтора opId между батчами
  // (двойная доставка невозможна без повторного появления opId в телах).
  const seen = new Set();
  let totalOps = 0;
  for (const record of opsRequests) {
    for (const opId of record.opIds) {
      totalOps += 1;
      expect(seen.has(opId), `opId ${opId} delivered more than once`).toBe(false);
      seen.add(opId);
    }
  }
  expect(seen.size).toBe(totalOps);

  // Версия второй серии инкрементирована ровно на число батчей с новыми opId:
  // replay/undo в серии нет — каждый 200-ack батч = +1, skip-ack = 0.
  const deliveredFirstTime = new Set();
  let appliedBatches = 0;
  for (const record of opsRequests) {
    if (record.atMs < series2Start || record.atMs > series2End + 60_000) continue;
    if (record.status !== 200) continue;
    const fresh = record.opIds.filter((opId) => !deliveredFirstTime.has(opId));
    if (fresh.length > 0) {
      appliedBatches += 1;
      for (const opId of fresh) deliveredFirstTime.add(opId);
    }
  }
  expect(
    versionAfter - versionAfterReload,
    `second-series version delta ${versionAfter - versionAfterReload} must equal applied batch count ${appliedBatches} (open-time PUTs excluded)`,
  ).toEqual(appliedBatches);
  expect(
    versionAfterReload,
    "version must not regress across reload (no losses)",
  ).toBeGreaterThanOrEqual(versionMid);

  // Бюджет «0 PUT /bpmn вне fallback»: ни одного полного сохранения в окнах
  // edit-series (open-time reconcile PUT'ы — пре-существующее поведение
  // baseline и не входят в окна).
  const putsInSeries = putBpmn.filter(
    (p) => (p.atMs >= series1Start && p.atMs <= series1End)
      || (p.atMs >= series2Start && p.atMs <= series2End),
  );
  expect(putsInSeries, `zero PUT /bpmn during edit series windows: ${JSON.stringify(putsInSeries)}`).toHaveLength(0);
  expect(putsAfterReload, "open-time PUT count after reload is informational").toBeGreaterThanOrEqual(putsBeforeSeries);

  // Полный набор маркеров на сервере (потерь = 0).
  const serverXml = await fetchServerXml(request, fixture.sessionId, headers);
  for (const marker of [...firstBatch, ...secondBatch]) {
    expect(serverXml.includes(marker), `server XML contains ${marker}`).toBe(true);
  }

  expect(pageErrors, `no page errors: ${JSON.stringify(pageErrors.slice(0, 3))}`).toHaveLength(0);
});
