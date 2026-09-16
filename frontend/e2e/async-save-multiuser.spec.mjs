// E2E-спека feature/async-save-pipeline-step2 — мультипользовательская
// конвергенция (TESTS.md §4.2, PLAN §6, UI.md §4/§5/§7).
//
// Все сценарии на org ≠ default (урок #989, helper nonDefaultOrg.mjs).
// Два browser context = два независимых клиента (отдельные clientId/outbox,
// PLAN §6.6); прецедент двух контекстов — canvas-editing-stability.spec.mjs.
//
// Сценарии:
//   4. convergence: разные элементы → сходимость через ops_committed,
//      ≤1 суммарного 409, оба маркера у обоих клиентов.
//   5. LWW-conflict: один elementId у двух клиентов → побеждает серверный
//      порядок (правка B), у проигравшего (A) toast + «предложенные
//      изменения»; применение по клику → обе правки последовательно на
//      сервере (финал — маркер A).
//   6. offline-catch-up: B offline с pendingOps догоняет правки A после
//      возврата сети (409-rebase), свои правки не теряет.
//   7. soft-lock: A выбирает элемент → у B (второй пользователь — presence
//      группирует по user_id) overlay-бейдж «{user} редактирует этот элемент»
//      (presence heartbeat, TTL-окно).

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";
import { makeHeavyEditingDiagramXml } from "./helpers/heavyEditingFixture.mjs";
import { readServerDiagramStateVersion } from "./helpers/canvasStabilitySteps.mjs";
import {
  createOrgSessionFixture,
  createOrgUser,
  loginOrgUser,
  orgHeaders,
} from "./helpers/nonDefaultOrg.mjs";

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

function collect409(page) {
  const conflicts = [];
  page.on("response", (response) => {
    if (response.status() === 409) conflicts.push({ url: response.url(), status: 409 });
  });
  return conflicts;
}

function collectOpsRequests(page) {
  const records = [];
  const pending = [];
  const OPS_URL = /\/api\/sessions\/[^/]+\/operations$/;
  page.on("request", (request) => {
    if (request.method() !== "POST" || !OPS_URL.test(request.url())) return;
    let body = {};
    try {
      body = JSON.parse(request.postData() || "{}");
    } catch {
      body = {};
    }
    const record = {
      opIds: (Array.isArray(body.operations) ? body.operations : []).map((op) => String(op?.opId || "")),
      status: null,
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

// SSE-проба: оборачиваем EventSource, логируем ops_committed (доставка vs
// consumer — разводим транспорт и обработку при диагностике сходимости).
async function installSseProbe(page) {
  await page.addInitScript(() => {
    window.__PM_E2E_SSE__ = [];
    window.__PM_E2E_CONSOLE__ = [];
    const origWarn = console.warn.bind(console);
    console.warn = (...args) => {
      window.__PM_E2E_CONSOLE__.push(args.map((a) => String(a)).join(" ").slice(0, 300));
      origWarn(...args);
    };
    const Original = window.EventSource;
    if (!Original) return;
    window.EventSource = class extends Original {
      constructor(url, options) {
        super(url, options);
        this.addEventListener("ops_committed", (event) => {
          try {
            const data = JSON.parse(event.data || "{}");
            window.__PM_E2E_SSE__.push({
              version: data.version,
              actor: data.actor_client_id,
              full: data.full === true,
              opIds: (data.operations || []).map((op) => String(op?.opId || "")),
            });
          } catch {
            window.__PM_E2E_SSE__.push({ parseError: true });
          }
        });
      }
    };
  });
}

function readSseEvents(page) {
  return page.evaluate(() => (window.__PM_E2E_SSE__ || []));
}

// ---------------------------------------------------------------------------
// Канвас-хелперы
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

function readElementName(page, elementId) {
  return page.evaluate((id) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    return String(modeler?.get("elementRegistry")?.get(id)?.businessObject?.name || "");
  }, elementId);
}

async function waitForElementName(page, elementId, expected, timeoutMs = 30_000) {
  try {
    await expect
      .poll(async () => (await readElementName(page, elementId)) === expected ? 1 : 0, {
        timeout: timeoutMs,
        message: `${elementId} name must become "${expected}" (currently "${await readElementName(page, elementId)}")`,
      })
      .toBe(1);
  } catch (error) {
    const sse = await readSseEvents(page).catch(() => []);
    const consoleLog = await page.evaluate(() => (window.__PM_E2E_CONSOLE__ || [])).catch(() => []);
    const names = await page.evaluate(() => {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      const registry = modeler?.get?.("elementRegistry");
      const out = {};
      for (const id of ["Task_1_1", "Task_2_1", "Task_2_5", "Task_2_6"]) {
        out[id] = String(registry?.get?.(id)?.businessObject?.name || "(missing)");
      }
      return out;
    }).catch(() => ({}));
    throw new Error(`${String(error?.message || error)}\nSSE ops_committed at page: ${JSON.stringify(sse)}\nconsole.warn: ${JSON.stringify(consoleLog.slice(-12))}\nmodel names: ${JSON.stringify(names)}`);
  }
}

async function selectElement(page, elementId) {
  const result = await page.evaluate((targetId) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const element = modeler.get("elementRegistry").get(String(targetId));
      if (!element) return { ok: false, error: "element_missing:" + targetId };
      modeler.get("selection").select(element);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, elementId);
  expect(result.ok, `select ${elementId}: ${JSON.stringify(result)}`).toBeTruthy();
}

// Move-хелперы (MAJOR-3 review): сходимость геометрии — rename идемпотентен и
// маскировал двойное применение delta (BLOCKER-1). moveShape (singular) даёт
// commandStack-контекст {shape, delta} — ровно то, что маппит shape.move.
async function moveElement(page, elementId, delta) {
  const result = await page.evaluate((arg) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const el = registry.get(arg.elementId);
      if (!el) return { ok: false, error: "element_missing:" + arg.elementId };
      modeling.moveShape(el, arg.delta);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, { elementId, delta });
  expect(result.ok, `move ${elementId}: ${JSON.stringify(result)}`).toBeTruthy();
}

function readElementPosition(page, elementId) {
  return page.evaluate((id) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const el = modeler?.get("elementRegistry")?.get(id);
    if (!el) return null;
    return { x: Math.round(Number(el.x) || 0), y: Math.round(Number(el.y) || 0) };
  }, elementId);
}

async function waitForPosition(page, elementId, expected, timeoutMs = 45_000) {
  try {
    await expect
      .poll(async () => {
        const pos = await readElementPosition(page, elementId);
        return pos && pos.x === expected.x && pos.y === expected.y ? 1 : 0;
      }, {
        timeout: timeoutMs,
        message: `${elementId} must be at (${expected.x}, ${expected.y}) at target client (currently ${JSON.stringify(await readElementPosition(page, elementId))})`,
      })
      .toBe(1);
  } catch (error) {
    const diag = await page.evaluate(() => ({
      sse: window.__PM_E2E_SSE__ || [],
      flushed: window.__PM_OPS_FLUSHED__ || null,
      console: (window.__PM_E2E_CONSOLE__ || []).slice(-10),
    })).catch(() => null);
    throw new Error(`${String(error?.message || error)}\ndiagnostics@${elementId}: ${JSON.stringify(diag)}`);
  }
}

// Немедленный flush: синтетический window 'online' — штатный триггер
// координатора (installOpsOutboxNetworkTriggers). Детерминизирует сценарии,
// где дебounce-окно 2.5 c критично (LWW).
function triggerFlush(page) {
  return page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
  });
}

// Heartbeat по требованию: штатный foreground-триггер useSessionPresence
// (focus/visibilitychange → heartbeat). Ускоряет soft-lock без ожидания 15-с
// интервала; TTL-окно ровно то же.
function triggerPresenceHeartbeat(page) {
  return page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
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
// Бутстрап: org ≠ default + два контекста на одной сессии
// ---------------------------------------------------------------------------

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

async function openSessionInPage(page, auth, fixture, { userId = "" } = {}) {
  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await installSseProbe(page);
  await setUiToken(page, auth.accessToken, {
    activeOrgId: fixture.orgId,
    refreshToken: auth.refreshToken,
    refreshCookie: auth.refreshCookie,
  });
  const uid = String(userId || auth.userId || "");
  if (uid) {
    await page.addInitScript((value) => {
      window.sessionStorage.setItem(`fpc_org_choice_done:${value}`, "1");
    }, uid);
  }
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  await waitForDiagramReady(page, { timeout: 90_000 });
}

async function bootstrapTwoClients(browser, request, runTag) {
  const auth = await apiLogin(request, {});
  const fixture = await createOrgSessionFixture(request, auth, {
    orgName: `E2E async-save-multiuser ${runTag}`,
    sessionTitle: `E2E multiuser session ${runTag}`,
    xml: makeHeavyEditingDiagramXml({ lanes: 2, tasksPerLane: 8 }),
  });
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const errorsA = collectPageErrors(pageA);
  const errorsB = collectPageErrors(pageB);
  const conflictsA = collect409(pageA);
  const conflictsB = collect409(pageB);
  try {
    await openSessionInPage(pageA, auth, fixture);
    await openSessionInPage(pageB, auth, fixture);
    await waitForElementsPresent(pageA, ["Task_1_1", "Task_1_5", "Task_2_1", "Task_2_5", "Task_2_6"], 90_000);
    await waitForElementsPresent(pageB, ["Task_1_1", "Task_1_5", "Task_2_1", "Task_2_5", "Task_2_6"], 90_000);
  } catch (error) {
    await contextA.close().catch(() => {});
    await contextB.close().catch(() => {});
    throw error;
  }
  return {
    auth,
    fixture,
    headers: orgHeaders(auth, fixture.orgId),
    contextA,
    pageA,
    contextB,
    pageB,
    errorsA,
    errorsB,
    conflictsA,
    conflictsB,
    async close() {
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    },
  };
}

// ---------------------------------------------------------------------------
// Тест 4 — convergence (TESTS.md §4.2.4)
// ---------------------------------------------------------------------------

test("async save multiuser: edits on different elements converge on both clients via ops_committed without 409 loop", async ({ browser, request }) => {
  const runTag = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const ctx = await bootstrapTwoClients(browser, request, runTag);
  try {
    const markerA = `CV_A_${runTag}`;
    const markerB = `CV_B_${runTag}`;
    await renameElement(ctx.pageA, "Task_1_1", markerA);
    await renameElement(ctx.pageB, "Task_2_1", markerB);
    // Детерминизм доставки: флашим A первым и ждём серверный коммит — тогда
    // событие A приходит к B до ack B (seen-версия B ещё старая) и
    // применяется гарантированно. Гонка «собственный ack раньше чужого
    // события» (consumer stale-drop) покрыта step1 409-race тестом и
    // LWW-сценарием ниже; здесь цель — сходимость через ops_committed.
    await triggerFlush(ctx.pageA);
    await waitForServerXmlSubstring(request, ctx.fixture.sessionId, ctx.headers, markerA, FLUSH_WAIT_MS + 10_000);
    await triggerFlush(ctx.pageB);

    // Сходимость: каждый клиент видит чужой маркер (SSE ops_committed →
    // remote apply на live-модель).
    await waitForElementName(ctx.pageA, "Task_2_1", markerB, FLUSH_WAIT_MS + 15_000);
    await waitForElementName(ctx.pageB, "Task_1_1", markerA, FLUSH_WAIT_MS + 15_000);

    // Оба маркера на сервере, потерь нет.
    const serverXml = await fetchServerXml(request, ctx.fixture.sessionId, ctx.headers);
    expect(serverXml.includes(markerA), "server XML contains A marker").toBe(true);
    expect(serverXml.includes(markerB), "server XML contains B marker").toBe(true);

    // Бюджет 409: ≤1 суммарно за сценарий.
    const total409 = ctx.conflictsA.length + ctx.conflictsB.length;
    expect(total409, `at most one 409 per scenario, got ${JSON.stringify([...ctx.conflictsA, ...ctx.conflictsB])}`).toBeLessThanOrEqual(1);

    // Модал конфликта не показан ни одному клиенту.
    for (const [label, page] of [["A", ctx.pageA], ["B", ctx.pageB]]) {
      const modalVisible = await page.getByTestId("diagram-save-conflict-modal").isVisible().catch(() => false);
      expect(modalVisible, `conflict modal must not appear for client ${label}`).toBe(false);
    }

    expect(ctx.errorsA, `no page errors A: ${JSON.stringify(ctx.errorsA.slice(0, 3))}`).toHaveLength(0);
    expect(ctx.errorsB, `no page errors B: ${JSON.stringify(ctx.errorsB.slice(0, 3))}`).toHaveLength(0);
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// Тест 5 — LWW-conflict + «предложенные изменения» (TESTS.md §4.2.5)
// ---------------------------------------------------------------------------

test("async save multiuser: same element conflict moves losing edit to proposed changes, apply commits both edits sequentially", async ({ browser, request }) => {
  const runTag = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const ctx = await bootstrapTwoClients(browser, request, runTag);
  try {
    const versionBefore = await readServerDiagramStateVersion(ctx.pageA, ctx.fixture.sessionId, ctx.headers);
    const markerA = `LWW_A_${runTag}`;
    const markerB = `LWW_B_${runTag}`;

    // A правит элемент → op в буфере (debounce 2.5 c до flush).
    await renameElement(ctx.pageA, "Task_1_5", markerA);
    // B правит тот же элемент и немедленно флашит (online-триггер) → серверный
    // коммит и ops_committed доходят до A ДЕБАУНС-ОКНА A: op A ещё pending →
    // LWW-детект в consumer'е.
    await renameElement(ctx.pageB, "Task_1_5", markerB);
    await triggerFlush(ctx.pageB);

    // У A чужая правка применена к live-модели.
    await waitForElementName(ctx.pageA, "Task_1_5", markerB, 10_000);

    // Проигравшая op A ушла в «предложенные изменения» + toast.
    const panel = ctx.pageA.getByTestId("ops-proposed-panel");
    await expect(panel, "proposed-changes panel must appear at losing client").toBeVisible({ timeout: 10_000 });
    await expect(panel).toHaveAttribute("data-count", "1");
    await expect(ctx.pageA.getByTestId("ops-proposed-item")).toHaveCount(1);
    await expect(
      ctx.pageA.getByText(/предложенных изменениях/),
      "LWW toast must notify the losing client",
    ).toBeVisible({ timeout: 10_000 });

    // Сервер пока содержит только правку B.
    const serverXmlBeforeApply = await fetchServerXml(request, ctx.fixture.sessionId, ctx.headers);
    expect(serverXmlBeforeApply.includes(markerB), "server XML has winner marker (B)").toBe(true);

    // Применение по клику: op возвращается в буфер новым opId → flush →
    // серверная версия +1, финальный маркер — A.
    await ctx.pageA.getByTestId("ops-proposed-apply").click();
    await waitForServerXmlSubstring(request, ctx.fixture.sessionId, ctx.headers, markerA, FLUSH_WAIT_MS + 10_000);
    await expect(panel, "proposed panel must clear after apply").toHaveCount(0, { timeout: 10_000 });

    // B получает ops_committed с правкой A → обе правки последовательно
    // видны на обоих клиентах (канон — серверный порядок: A последний).
    await waitForElementName(ctx.pageB, "Task_1_5", markerA, FLUSH_WAIT_MS + 10_000);

    const versionAfter = await readServerDiagramStateVersion(ctx.pageA, ctx.fixture.sessionId, ctx.headers);
    expect(
      versionAfter - versionBefore,
      `exactly two truth-writes expected (B commit + A re-apply), got delta ${versionAfter - versionBefore}`,
    ).toEqual(2);

    expect(ctx.conflictsA.length + ctx.conflictsB.length, "no 409 expected in LWW scenario").toEqual(0);
    expect(ctx.errorsA, `no page errors A: ${JSON.stringify(ctx.errorsA.slice(0, 3))}`).toHaveLength(0);
    expect(ctx.errorsB, `no page errors B: ${JSON.stringify(ctx.errorsB.slice(0, 3))}`).toHaveLength(0);
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// Тест 6 — offline-catch-up (TESTS.md §4.2.6)
// ---------------------------------------------------------------------------

test("async save multiuser: offline client catches up after online without losing its own pending edits", async ({ browser, request }) => {
  const runTag = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const ctx = await bootstrapTwoClients(browser, request, runTag);
  try {
    const opsB = collectOpsRequests(ctx.pageB);
    const markerA = `CATCH_A_${runTag}`;
    const markerB = `CATCH_B_${runTag}`;

    // B уходит offline.
    ctx.contextB.setOffline(true);

    // A правит и флашит → сервер.
    await renameElement(ctx.pageA, "Task_2_5", markerA);
    await triggerFlush(ctx.pageA);
    await waitForServerXmlSubstring(request, ctx.fixture.sessionId, ctx.headers, markerA, FLUSH_WAIT_MS + 10_000);

    // B правит офлайн: flush подавлен, правка остаётся в durable-буфере.
    await renameElement(ctx.pageB, "Task_2_6", markerB);
    await ctx.pageB.waitForTimeout(4_000);
    expect(opsB, "no POST /operations from offline client B").toHaveLength(0);
    await expect(
      ctx.pageB.getByTestId("diagram-toolbar-save-status-awaiting-network"),
      "offline client B must show awaiting-network sublabel",
    ).toHaveText("ожидает сеть", { timeout: 15_000 });

    // Сеть вернулась: догон (старый base → 409 → rebase поверх серверного XML
    // с правкой A → повторный flush со своей правкой B).
    ctx.contextB.setOffline(false);
    await waitForServerXmlSubstring(request, ctx.fixture.sessionId, ctx.headers, markerB, FLUSH_WAIT_MS + 15_000);

    const serverXml = await fetchServerXml(request, ctx.fixture.sessionId, ctx.headers);
    expect(serverXml.includes(markerA), "server XML has A marker").toBe(true);
    expect(serverXml.includes(markerB), "server XML has B marker (no losses)").toBe(true);

    // B догнал правку A (rebase загрузил серверный XML), A получил правку B
    // через ops_committed.
    await waitForElementName(ctx.pageB, "Task_2_5", markerA, FLUSH_WAIT_MS + 10_000);
    await waitForElementName(ctx.pageA, "Task_2_6", markerB, FLUSH_WAIT_MS + 10_000);

    // 409-луп отсутствует: у B может быть 0 409 (base догнался через
    // presence-ответ diagram_state_version) или ровно 1 (stale-base rebase) —
    // бюджет TESTS.md §5: ≤1 на сценарий. Rebase-путь подтверждён
    // B-сайдом: модель B содержит CATCH_A (waitForElementName выше).
    const ops409B = ctx.conflictsB.filter((c) => /\/operations$/.test(c.url));
    expect(ops409B.length, `at most one 409 expected at client B, got ${JSON.stringify(ctx.conflictsB)}`).toBeLessThanOrEqual(1);
    const seen = new Set();
    for (const record of opsB) {
      for (const opId of record.opIds) {
        expect(seen.has(opId), `opId ${opId} delivered more than once`).toBe(false);
        seen.add(opId);
      }
    }

    expect(ctx.errorsA, `no page errors A: ${JSON.stringify(ctx.errorsA.slice(0, 3))}`).toHaveLength(0);
    expect(ctx.errorsB, `no page errors B: ${JSON.stringify(ctx.errorsB.slice(0, 3))}`).toHaveLength(0);
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// Тест 7 — soft-lock (TESTS.md §4.2.7)
// ---------------------------------------------------------------------------

test("async save multiuser: selecting an element shows editing badge to the other user via presence", async ({ browser, request }) => {
  const runTag = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const auth = await apiLogin(request, {});
  const fixture = await createOrgSessionFixture(request, auth, {
    orgName: `E2E async-save-softlock ${runTag}`,
    sessionTitle: `E2E softlock session ${runTag}`,
    xml: makeHeavyEditingDiagramXml({ lanes: 2, tasksPerLane: 8 }),
  });

  // Второй пользователь: presence группирует active_users по user_id — бейдж
  // «{user} редактирует этот элемент» виден только другому пользователю
  // (computeSoftLockTargets пропускает is_current_user).
  const userBEmail = `e2e.softlock.${runTag}@local`;
  const userBPassword = `e2e-${runTag}-pass`;
  const created = await createOrgUser(request, auth, {
    email: userBEmail,
    password: userBPassword,
    fullName: `E2E Softlock B ${runTag}`,
    orgId: fixture.orgId,
    role: "org_admin",
  });
  const authB = await loginOrgUser(request, { email: userBEmail, password: userBPassword });

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const errorsA = collectPageErrors(pageA);
  const errorsB = collectPageErrors(pageB);
  try {
    await openSessionInPage(pageA, auth, fixture);
    await openSessionInPage(pageB, authB, fixture, { userId: String(created?.id || authB.userId || "") });
    await waitForElementsPresent(pageA, ["Task_1_7"], 90_000);
    await waitForElementsPresent(pageB, ["Task_1_7"], 90_000);

    // A выбирает элемент → editingElementId уходит с presence-touch.
    await selectElement(pageA, "Task_1_7");
    await triggerPresenceHeartbeat(pageA);
    await pageA.waitForTimeout(500);
    await triggerPresenceHeartbeat(pageB);

    // У B — overlay-бейдж на элементе (TTL-окно presence 60 c, heartbeat 15 c;
    // foreground-триггеры выше сокращают ожидание до ~секунд).
    const badge = pageB.getByTestId("pm-softlock-badge");
    await expect(badge, "soft-lock badge must appear at client B").toBeVisible({ timeout: 60_000 });
    await expect(badge).toContainText(/редактирует этот элемент/);

    expect(errorsA, `no page errors A: ${JSON.stringify(errorsA.slice(0, 3))}`).toHaveLength(0);
    expect(errorsB, `no page errors B: ${JSON.stringify(errorsB.slice(0, 3))}`).toHaveLength(0);
  } finally {
    await contextA.close().catch(() => {});
    await contextB.close().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Тест 8 — move-convergence (MAJOR-3 review): оба клиента двигают РАЗНЫЕ
// фигуры → позиции сходятся у обоих ровно к одиночному delta. Имена
// идемпотентны и маскировали BLOCKER-1 (replay pending на модели, уже
// содержащей правки → двойное применение shape.move delta).
// ---------------------------------------------------------------------------

test("async save multiuser: move convergence — both clients move different shapes, positions converge to exactly one delta (no double-apply)", async ({ browser, request }) => {
  const runTag = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const ctx = await bootstrapTwoClients(browser, request, runTag);
  try {
    const initialA = await readElementPosition(ctx.pageA, "Task_1_1");
    const initialB = await readElementPosition(ctx.pageB, "Task_2_1");
    expect(initialA, "initial position Task_1_1 readable").toBeTruthy();
    expect(initialB, "initial position Task_2_1 readable").toBeTruthy();

    const deltaA = { x: 40, y: 0 };
    const deltaB = { x: -30, y: 20 };
    const expectedA = { x: initialA.x + deltaA.x, y: initialA.y + deltaA.y };
    const expectedB = { x: initialB.x + deltaB.x, y: initialB.y + deltaB.y };

    // Оба move'ят: у каждого клиента pending move-op своего элемента.
    try {
    await moveElement(ctx.pageA, "Task_1_1", deltaA);
    await moveElement(ctx.pageB, "Task_2_1", deltaB);

    // Коммит A первым: событие A приходит к B, пока move B ещё pending в
    // буфере — ровно окно BLOCKER-1 (consumer обязан НЕ replay'ить pending).
    await triggerFlush(ctx.pageA);
    await waitForPosition(ctx.pageB, "Task_1_1", expectedA, FLUSH_WAIT_MS + 20_000);

    // B применил чужое событие, своё НЕ применил повторно: своя позиция —
    // ровно одиночный delta (двойное применение дало бы initial + 2×delta).
    const bOwnAfterRemote = await readElementPosition(ctx.pageB, "Task_2_1");
    expect(
      bOwnAfterRemote,
      "client B own position after receiving remote event must be single-applied",
    ).toEqual(expectedB);

    // Коммит B → A получает чужое событие со своим pending move Task_1_1.
    await triggerFlush(ctx.pageB);
    await waitForPosition(ctx.pageA, "Task_2_1", expectedB, FLUSH_WAIT_MS + 20_000);

    // Финальная сверка у обоих клиентов: позиции ровно одиночные delta.
    try {
      for (const [label, page] of [["A", ctx.pageA], ["B", ctx.pageB]]) {
        const posA = await readElementPosition(page, "Task_1_1");
        const posB = await readElementPosition(page, "Task_2_1");
        expect(posA, `client ${label} Task_1_1 = initial + one delta (not doubled)`).toEqual(expectedA);
        expect(posB, `client ${label} Task_2_1 = initial + one delta (not doubled)`).toEqual(expectedB);
      }
    } catch (error) {
      const diagB = await ctx.pageB.evaluate(() => ({
        sse: window.__PM_E2E_SSE__ || [],
        flushed: window.__PM_OPS_FLUSHED__ || null,
        console: (window.__PM_E2E_CONSOLE__ || []).slice(-10),
      })).catch(() => null);
      throw new Error(`${String(error?.message || error)}\nB diagnostics: ${JSON.stringify(diagB)}\nconflictsA=${JSON.stringify(ctx.conflictsA)} conflictsB=${JSON.stringify(ctx.conflictsB)}`);
    }

    // Оба коммита на сервере (B видел move A только через ops_committed —
    // публикация идёт после durable commit, серверность покрыта транзитивно;
    // здесь — бюджет 409 и отсутствие ошибок).
    const total409 = ctx.conflictsA.length + ctx.conflictsB.length;
    expect(total409, `at most one 409 per scenario, got ${JSON.stringify([...ctx.conflictsA, ...ctx.conflictsB])}`).toBeLessThanOrEqual(1);

    expect(ctx.errorsA, `no page errors A: ${JSON.stringify(ctx.errorsA.slice(0, 3))}`).toHaveLength(0);
    expect(ctx.errorsB, `no page errors B: ${JSON.stringify(ctx.errorsB.slice(0, 3))}`).toHaveLength(0);
    } catch (error) {
      const diag = async (page) => page.evaluate(() => ({
        sse: window.__PM_E2E_SSE__ || [],
        flushed: window.__PM_OPS_FLUSHED__ || null,
        console: (window.__PM_E2E_CONSOLE__ || []).slice(-8),
      })).catch(() => null);
      const [diagA, diagB] = await Promise.all([diag(ctx.pageA), diag(ctx.pageB)]);
      throw new Error(`${String(error?.message || error)}\nA=${JSON.stringify(diagA)}\nB=${JSON.stringify(diagB)}\nerrorsA=${JSON.stringify(ctx.errorsA)} errorsB=${JSON.stringify(ctx.errorsB)}\nconflictsA=${JSON.stringify(ctx.conflictsA)} conflictsB=${JSON.stringify(ctx.conflictsB)}`);
    }
  } finally {
    await ctx.close();
  }
});
