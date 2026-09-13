// RED-тесты контура fix/canvas-editing-stability (этап 1, TDD red).
//
// Контракт стабильности сохранения (продолжение контракта perf из PR #952):
//   5. Одиночная сессия на heavy-схеме (250+): полный пользовательский путь
//      (таска → текст → сайтбар «Свойства» → BPMN-свойство → вторая таска →
//      «Сохранить» → «Новая версия») — 0 ответов HTTP 409.
//   6. Фоновая активность (presence heartbeat ~5 с, remote-session sync 30 с)
//      НЕ меняет серверную diagram_state_version: 15 с простоя — версия равна,
//      0 ответов 409.
//   7. Внешнее изменение версии (вторая вкладка = другой browser context,
//      другой client id → same-tab auto-resolve НЕ срабатывает):
//      a) «Оставить мою версию»: «Сохранить» в вкладке A → РОВНО ОДИН ответ
//         409 → модалка конфликта → overwrite успешен, правки A не потеряны,
//         серверная версия выросла.
//      b) «Загрузить версию с сервера»: после 409 → refresh → схема вкладки B
//         видна на канвасе A → повторное «Сохранить» (с новой правкой)
//         проходит БЕЗ 409 — baseVersion синхронизирован с сервером.
//
// Ожидания этапа 1 (RED): тест 5 может пасть на 409 от прямых PATCH вне очереди
// (App.jsx:2652/3190, useDraft.js:67 — без base → BASE_VERSION_REQUIRED);
// тест 7 может пасть на молчаливую перезагрузку/отсутствие модалки (кросс-таб
// синка версий пока нет — P1 из PLAN.md). Фактические причины фиксируются в
// TESTS_REPORT.md и являются входом для этапа 2.
//
// ---------------------------------------------------------------------------
// Спека дополнена сценариями контура fix/save-latency-subprocess-async
// (Этап 8, PLAN v2 §5 «E2E»):
//   8.1 «Медленный PUT + печать в интервью»: route interception задерживает
//       PUT /api/sessions/{id}/bpmn на ~12 с (прежний порог abort 10 с,
//       сейчас transportTimeoutMs 60 с — таймаут не срабатывает); во время
//       полёта пользователь печатает шаги в интервью-сайдбаре → 0×409,
//       0 конфликт-модалок, введённые шаги не теряются, save завершается
//       успехом.
//   8.2 «Большая схема, серия правок»: схема 250+ элементов с 30+
//       подпроцессами (XML генерируется программно, без fixture-файла),
//       серия правок канваса → 0×409, 0 конфликт-модалок; gaps/duration
//       PUT-запросов пишутся в лог теста (console + test.info attachments).
//
// Запуск (PLAN §7): спека гоняется на STAGE после деплоя ветки. Локально
// против worktree она НЕ запускается без мутации общего стека (docker-стек
// совпадает с canonical runtime) — см. команды ниже для выделенного стека.
// В dev-стеке (admin@local/admin, localhost:5177/8011) спека работоспособна
// как есть: E2E_APP_BASE_URL/E2E_API_BASE_URL указывают на поднятый стек.
//
// Запуск (worktree, host без node — всё в docker):
//   dev-server:  docker run -d --name pm-canvas-stab-vite \
//                  -v <worktree>/frontend:/app -w /app -p 5197:5197 \
//                  -e VITE_PORT=5197 \
//                  -e VITE_API_PROXY_TARGET=http://host.docker.internal:8011 \
//                  node:20 npm run dev -- --host 0.0.0.0 --strictPort
//   прогон:      docker run --rm -v <worktree>:/ws -w /ws/frontend \
//                  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
//                  -e E2E_APP_BASE_URL=http://172.17.0.1:5197 \
//                  -e E2E_API_BASE_URL=http://172.17.0.1:8011 \
//                  local-playwright:v1.58.2 npx playwright test \
//                  e2e/canvas-editing-stability.spec.mjs
//
// ВАЖНО: VITE_PORT=5197 обязателен (иначе HMR reload-loop, см. TESTS_REPORT
// прошлого контура); вместо host.docker.internal для тестов — gateway-IP
// 172.17.0.1 (vite allowedHosts блокирует незнакомые Host-заголовки).

import { expect, test } from "@playwright/test";

import {
  bootstrapHeavySession,
  clickCreateRevisionAndWait,
  clickToolbarSave,
  clickToolbarSaveAndWaitSaved,
  collectConflictResponses,
  collectPageErrors,
  createTaskAndType,
  expectHeavyDiagramLoaded,
  loginAndCreateHeavyFixture,
  openHeavySessionInPage,
  readServerDiagramStateVersion,
  selectElementAndAddProperty,
  APP_BASE,
} from "./helpers/canvasStabilitySteps.mjs";
import { apiLogin } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, switchTab } from "./helpers/processFixture.mjs";

// ---------------------------------------------------------------------------
// Тест 5 — контракт 5: одиночная сессия, полный путь, 0×409.
// ---------------------------------------------------------------------------

test("single session: full editing path on heavy diagram produces zero 409 responses", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  const conflicts409 = collectConflictResponses(page);
  const { } = await bootstrapHeavySession(page, request, runId);
  await expectHeavyDiagramLoaded(page);

  // 1. Первая таска + текст.
  const firstId = await createTaskAndType(page, "Шаг стабильности первый");

  // 2. Сайтбар rail «Свойства» → добавить и сохранить BPMN-свойство.
  await selectElementAndAddProperty(page, firstId, { name: "priority", value: "high" });

  // 3. Вторая таска + текст.
  await createTaskAndType(page, "Шаг стабильности второй");

  // 4. «Сохранить» → «Новая версия».
  await clickToolbarSaveAndWaitSaved(page);
  await clickCreateRevisionAndWait(page);

  expect(
    conflicts409,
    `full single-session path must produce zero 409 responses, got: ${JSON.stringify(conflicts409)}`,
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Тест 6 — контракт 6: фоновая активность ≠ запись. 15 с простоя — версия
// сервера не меняется, 0×409.
// ---------------------------------------------------------------------------

test("background activity (presence heartbeat, remote sync) does not bump server diagram_state_version", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  const conflicts409 = collectConflictResponses(page);
  const { auth, fixture } = await bootstrapHeavySession(page, request, runId);
  await expectHeavyDiagramLoaded(page);

  const versionBefore = await readServerDiagramStateVersion(page, fixture.sessionId, auth.headers);

  // Канвас открыт и пульсирует presence (~5 с интервал); remote sync 30 с.
  await page.waitForTimeout(15_000);

  const versionAfter = await readServerDiagramStateVersion(page, fixture.sessionId, auth.headers);

  expect(
    versionAfter,
    `server diagram_state_version must stay ${versionBefore} during 15s idle, got ${versionAfter}`,
  ).toEqual(versionBefore);
  expect(
    conflicts409,
    `idle window must produce zero 409 responses, got: ${JSON.stringify(conflicts409)}`,
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Конфликт-сценарий: две вкладки (два browser context = два client id).
// Общий бутстрап для обоих вариантов разрешения.
// ---------------------------------------------------------------------------

const TASK_A_NAME = "Правка вкладки А";
const TASK_B_NAME = "Правка вкладки B";

async function bootstrapTwoTabs(browser, request, runId) {
  // Один логин/фикстура — обе вкладки смотрят в одну сессию от одного пользователя.
  const { auth, fixture } = await loginAndCreateHeavyFixture(request, runId);

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();

  const close = async () => {
    await contextA.close().catch(() => {});
    await contextB.close().catch(() => {});
  };

  try {
    await openHeavySessionInPage(pageA, auth, fixture);
    await expectHeavyDiagramLoaded(pageA);
    await openHeavySessionInPage(pageB, auth, fixture);
    await expectHeavyDiagramLoaded(pageB);
  } catch (error) {
    await close();
    throw error;
  }

  return { auth, fixture, pageA, pageB, close };
}

// Внешнее изменение из вкладки B: таска + текст + «Сохранить» (PUT bpmn) →
// серверная версия +1. Возвращает версию сервера после записи B.
async function externalChangeFromTabB(pageB, auth, fixture) {
  await createTaskAndType(pageB, TASK_B_NAME);
  await clickToolbarSaveAndWaitSaved(pageB);
  const versionAfterB = await readServerDiagramStateVersion(pageB, fixture.sessionId, auth.headers);
  return versionAfterB;
}

// ---------------------------------------------------------------------------
// Тест 7a — «Оставить мою версию»: ровно один 409, модалка, overwrite,
// правки вкладки A не потеряны.
// ---------------------------------------------------------------------------

test("external change: exactly one 409, conflict modal, «Оставить мою версию» keeps my edits", async ({ browser, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { auth, fixture, pageA, pageB, close } = await bootstrapTwoTabs(browser, request, runId);
  try {
    // a) Вкладка A: таска + текст, НЕ сохранять.
    await createTaskAndType(pageA, TASK_A_NAME);

    // b) Вкладка B: внешнее изменение → версия сервера +1.
    const versionAfterB = await externalChangeFromTabB(pageB, auth, fixture);

    // c) Вкладка A: «Сохранить» → ровно один 409 → модалка конфликта
    //    (не серия 409, не молчаливая перезагрузка).
    const conflictsA = collectConflictResponses(pageA);
    await clickToolbarSave(pageA);

    const modal = pageA.getByTestId("diagram-save-conflict-modal");
    await expect(
      modal,
      "conflict modal must appear after external version bump (cross-client mode)",
    ).toBeVisible({ timeout: 30_000 });
    expect(
      conflictsA,
      `save in tab A must produce exactly one 409 response, got: ${JSON.stringify(conflictsA)}`,
    ).toHaveLength(1);

    // d) «Оставить мою версию» → сохранение успешно, правки A не потеряны.
    await pageA.getByTestId("diagram-save-conflict-modal-overwrite").click();
    await expect(
      pageA.getByText(/версия сохранена поверх серверной/i),
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      pageA.locator(".bpmnStageHost .djs-container").getByText(TASK_A_NAME).first(),
      "my task must survive the overwrite resolution",
    ).toBeVisible();

    // Доказательство durable-записи: серверная версия выросла ровно на 1.
    const versionAfterOverwrite = await readServerDiagramStateVersion(pageA, fixture.sessionId, auth.headers);
    expect(versionAfterOverwrite).toEqual(versionAfterB + 1);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------
// Тест 7b — «Загрузить версию с сервера»: после 409 → refresh → схема B видна,
// повторное «Сохранить» (с новой правкой) проходит БЕЗ 409 — baseVersion
// синхронизирован с сервером.
// ---------------------------------------------------------------------------

test("external change: «Загрузить версию с сервера» syncs baseVersion — re-save has no 409", async ({ browser, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { auth, fixture, pageA, pageB, close } = await bootstrapTwoTabs(browser, request, runId);
  try {
    // a) Вкладка A: таска + текст, НЕ сохранять.
    await createTaskAndType(pageA, TASK_A_NAME);

    // b) Вкладка B: внешнее изменение → версия сервера +1.
    await externalChangeFromTabB(pageB, auth, fixture);

    // c) Вкладка A: «Сохранить» → ровно один 409 → модалка.
    const conflictsA = collectConflictResponses(pageA);
    await clickToolbarSave(pageA);

    const modal = pageA.getByTestId("diagram-save-conflict-modal");
    await expect(modal, "conflict modal must appear after external version bump").toBeVisible({
      timeout: 30_000,
    });
    expect(
      conflictsA,
      `save in tab A must produce exactly one 409 response, got: ${JSON.stringify(conflictsA)}`,
    ).toHaveLength(1);

    // e-variant: «Загрузить версию с сервера».
    await pageA.getByTestId("diagram-save-conflict-modal-refresh").click();
    await expect(
      pageA.getByText(/сессия обновлена с сервера/i),
    ).toBeVisible({ timeout: 30_000 });

    // Схема обновлена с сервера: таска из вкладки B видна на канвасе A.
    await expectHeavyDiagramLoaded(pageA);
    await expect(
      pageA.locator(".bpmnStageHost .djs-container").getByText(TASK_B_NAME).first(),
      "server-side task from tab B must be visible after refresh",
    ).toBeVisible();

    // Ключевое утверждение: baseVersion синхронизирован — новая правка +
    // «Сохранить» проходят без 409.
    conflictsA.length = 0;
    await createTaskAndType(pageA, "Шаг после обновления с сервера");
    await clickToolbarSaveAndWaitSaved(pageA);

    expect(
      conflictsA,
      `re-save after refresh must produce zero 409 responses (baseVersion synced), got: ${JSON.stringify(conflictsA)}`,
    ).toEqual([]);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------
// Этап 8 (fix/save-latency-subprocess-async), сценарий 8.1:
// «медленный PUT /bpmn + печать в интервью-сайдбаре».
// ---------------------------------------------------------------------------

const PUT_BPMN_URL_RE = /\/api\/sessions\/[^/]+\/bpmn(?:\?.*)?$/;
const SLOW_PUT_DELAY_MS = Math.max(1000, Number(process.env.E2E_SLOW_PUT_DELAY_MS || 12_000));

// Задерживает ответ сервера на PUT /bpmn (прежний abort-порог 10 с,
// transportTimeoutMs сейчас 60 с — таймаут не должен сработать).
// Все PUT-запросы (включая незамедленные) попадают в putStats.
function installSlowPutRoute(page, { delayMs, putStats }) {
  page.on("request", (request) => {
    if (request.method() !== "PUT" || !PUT_BPMN_URL_RE.test(new URL(request.url()).pathname)) return;
    putStats.push({ url: request.url(), startedAt: Date.now(), durationMs: null, status: null });
  });
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "PUT" || !PUT_BPMN_URL_RE.test(new URL(request.url()).pathname)) return;
    const entry = [...putStats].reverse().find((item) => item.url === request.url() && item.durationMs === null);
    if (entry) {
      entry.durationMs = Date.now() - entry.startedAt;
      entry.status = response.status();
    }
  });
  return page.route(PUT_BPMN_URL_RE, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const response = await route.fetch();
    await route.fulfill({ response });
  });
}

// Ввод шагов интервью через quick-input (образец interview-steps-create).
async function typeInterviewSteps(page, names) {
  const quickInput = page.locator(".interviewQuickStepInput");
  await expect(quickInput, "quick-input интервью должен быть видим").toBeVisible();
  const actionInputs = page.locator('.interviewStepRow input[placeholder="Глагол + объект"]');
  for (const name of names) {
    const before = await actionInputs.count();
    await quickInput.fill(name);
    await quickInput.press("Enter");
    await expect(actionInputs).toHaveCount(before + 1);
  }
}

async function readInterviewStepValues(page) {
  return page
    .locator('.interviewStepRow input[placeholder="Глагол + объект"]')
    .evaluateAll((nodes) => nodes.map((node) => String(node.value || "")));
}

function expectNoConflictModal(page, label) {
  return expect(
    page.getByTestId("diagram-save-conflict-modal"),
    `${label}: конфликт-модалка не должна появляться`,
  ).toHaveCount(0);
}

test("slow PUT /bpmn (12s) + typing in interview sidebar: zero 409, zero modals, answer kept, save succeeds", async ({ page, request }, testInfo) => {
  test.setTimeout(240_000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  const conflicts409 = collectConflictResponses(page);
  const putStats = [];
  await installSlowPutRoute(page, { delayMs: SLOW_PUT_DELAY_MS, putStats });

  await bootstrapHeavySession(page, request, runId);
  await expectHeavyDiagramLoaded(page);

  // 1. «Сохранить» → PUT полетел, ответ будет через ~12 с.
  await clickToolbarSave(page);
  await expect
    .poll(() => putStats.length, { timeout: 15_000, message: "slow PUT /bpmn must be in flight" })
    .toBeGreaterThanOrEqual(1);

  // 2. Во время полёта — печать в интервью-сайдбаре.
  const stepNames = [
    `SLOWPUT_STEP_A_${runId.slice(-4)}`,
    `SLOWPUT_STEP_B_${runId.slice(-4)}`,
    `SLOWPUT_STEP_C_${runId.slice(-4)}`,
  ];
  await switchTab(page, "Interview");
  await expect(page.locator(".interviewStage")).toBeVisible();
  await typeInterviewSteps(page, stepNames);

  // 3. Обратно на диаграмму — save завершается успехом (60 s timeout не близок).
  await switchTab(page, "Diagram");
  await expectHeavyDiagramLoaded(page);
  const statusSlot = page.getByTestId("diagram-toolbar-save-status-slot");
  await expect
    .poll(async () => statusSlot.getAttribute("data-state"), { timeout: 120_000 })
    .toBe("saved");

  // Окно на опоздавшие 409/модалку после saved.
  await page.waitForTimeout(2_000);
  await expectNoConflictModal(page, "slow PUT scenario");
  expect(
    conflicts409,
    `slow PUT + interview typing must produce zero 409 responses, got: ${JSON.stringify(conflicts409)}`,
  ).toEqual([]);

  // 4. Ответ в сайдбаре не потерян: введённые шаги на месте.
  await page.waitForTimeout(1_500);
  await switchTab(page, "Interview");
  const values = await readInterviewStepValues(page);
  for (const name of stepNames) {
    expect(values.includes(name), `interview step '${name}' must survive the slow PUT`).toBeTruthy();
  }

  // Замеры: реальная задержка ответа и факт отсутствия abort (duration ≥ delay).
  const slowPut = putStats[putStats.length - 1];
  expect(
    slowPut.durationMs,
    `slow PUT duration must be >= ${SLOW_PUT_DELAY_MS}ms (no client abort), got ${slowPut.durationMs}`,
  ).toBeGreaterThanOrEqual(SLOW_PUT_DELAY_MS);
  console.log(`[canvas-stability] slow-put stats:`, JSON.stringify({ delayMs: SLOW_PUT_DELAY_MS, putStats }));
  await testInfo.attach("slow-put-bpmn-stats", {
    body: JSON.stringify({ runId, delayMs: SLOW_PUT_DELAY_MS, putStats }, null, 2),
    contentType: "application/json",
  });

  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Этап 8, сценарий 8.2: «большая схема 250+/30+ подпроцессов, серия правок».
// XML генерируется программно (fixture-файл не коммитим).
// ---------------------------------------------------------------------------

function escAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Цепочка start → N collapsed-подпроцессов (каждый с innerTasks тасками) → end.
// Элементов: N×(1 container + innerTasks тасков + (innerTasks-1) внутр. flows)
// + (N+1) chain flows + start/end. Для N=34, innerTasks=5 → 34×10 + 35 + 2 = 377.
function makeHeavySubprocessDiagramXml({ subprocessCount = 34, innerTasks = 5 } = {}) {
  const processId = "Process_subprocess_heavy";
  const nodeXml = [];
  const flowXml = [];
  const shapeXml = [];
  const edgeXml = [];
  const chainStep = 190;
  const firstX = 200;
  const y = 160;

  let prevId = "StartEvent_sub";
  nodeXml.push(`<bpmn:startEvent id="StartEvent_sub" name="Старт"><bpmn:outgoing>Flow_chain_0</bpmn:outgoing></bpmn:startEvent>`);
  shapeXml.push(`<bpmndi:BPMNShape id="StartEvent_sub_di" bpmnElement="StartEvent_sub"><dc:Bounds x="${firstX}" y="${y - 18}" width="36" height="36" /></bpmndi:BPMNShape>`);
  nodeXml.push(`<bpmn:sequenceFlow id="Flow_chain_0" sourceRef="StartEvent_sub" targetRef="Sub_1" />`);
  edgeXml.push(
    `<bpmndi:BPMNEdge id="Flow_chain_0_di" bpmnElement="Flow_chain_0"><di:waypoint x="${firstX + 36}" y="${y}" /><di:waypoint x="${firstX + chainStep}" y="${y}" /></bpmndi:BPMNEdge>`,
  );

  for (let s = 0; s < subprocessCount; s += 1) {
    const subId = `Sub_${s + 1}`;
    const chainFlowId = `Flow_chain_${s + 1}`;
    const x = firstX + chainStep * (s + 1);

    const innerNodes = [];
    const innerFlows = [];
    const innerShapes = [];
    const innerEdges = [];
    for (let t = 1; t <= innerTasks; t += 1) {
      const taskId = `${subId}_T${t}`;
      const incoming = t === 1 ? null : `${subId}_F${t - 1}`;
      const outgoing = t === innerTasks ? null : `${subId}_F${t}`;
      innerNodes.push(
        `<bpmn:task id="${taskId}" name="${escAttr(`Шаг ${s + 1}.${t}`)}">`
        + (incoming ? `<bpmn:incoming>${incoming}</bpmn:incoming>` : "")
        + (outgoing ? `<bpmn:outgoing>${outgoing}</bpmn:outgoing>` : "")
        + `</bpmn:task>`,
      );
      innerShapes.push(
        `<bpmndi:BPMNShape id="${taskId}_di" bpmnElement="${taskId}"><dc:Bounds x="${x + 20}" y="${y - 60 + t * 44}" width="120" height="36" /></bpmndi:BPMNShape>`,
      );
      if (outgoing) {
        innerFlows.push(`<bpmn:sequenceFlow id="${outgoing}" sourceRef="${taskId}" targetRef="${subId}_T${t + 1}" />`);
        innerEdges.push(
          `<bpmndi:BPMNEdge id="${outgoing}_di" bpmnElement="${outgoing}"><di:waypoint x="${x + 140}" y="${y - 42 + t * 44}" /><di:waypoint x="${x + 20}" y="${y - 42 + (t + 1) * 44}" /></bpmndi:BPMNEdge>`,
        );
      }
    }

    const nextRef = s === subprocessCount - 1 ? "EndEvent_sub" : `Sub_${s + 2}`;
    nodeXml.push(
      `<bpmn:subProcess id="${subId}" name="${escAttr(`Подпроцесс ${s + 1}`)}">`
      + `<bpmn:incoming>Flow_chain_${s}</bpmn:incoming>`
      + `<bpmn:outgoing>${chainFlowId}</bpmn:outgoing>`
      + innerNodes.join("")
      + innerFlows.join("")
      + `</bpmn:subProcess>`,
    );
    nodeXml.push(`<bpmn:sequenceFlow id="${chainFlowId}" sourceRef="${subId}" targetRef="${nextRef}" />`);
    shapeXml.push(
      `<bpmndi:BPMNShape id="${subId}_di" bpmnElement="${subId}" isExpanded="false"><dc:Bounds x="${x}" y="${y - 45}" width="160" height="110" /></bpmndi:BPMNShape>`,
    );
    shapeXml.push(...innerShapes);
    edgeXml.push(
      `<bpmndi:BPMNEdge id="${chainFlowId}_di" bpmnElement="${chainFlowId}"><di:waypoint x="${x + 160}" y="${y + 10}" /><di:waypoint x="${x + chainStep}" y="${y + 10}" /></bpmndi:BPMNEdge>`,
    );
    edgeXml.push(...innerEdges);
  }

  const endX = firstX + chainStep * (subprocessCount + 1);
  nodeXml.push(`<bpmn:endEvent id="EndEvent_sub" name="Финиш"><bpmn:incoming>Flow_chain_${subprocessCount}</bpmn:incoming></bpmn:endEvent>`);
  shapeXml.push(`<bpmndi:BPMNShape id="EndEvent_sub_di" bpmnElement="EndEvent_sub"><dc:Bounds x="${endX}" y="${y - 18}" width="36" height="36" /></bpmndi:BPMNShape>`);

  const width = endX + 120;
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_subprocess_heavy" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${processId}" isExecutable="false">
    ${nodeXml.join("\n    ")}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_sub">
    <bpmndi:BPMNPlane id="BPMNPlane_sub" bpmnElement="${processId}">
      ${shapeXml.join("\n      ")}
      ${edgeXml.join("\n      ")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function readSubprocessCount(page) {
  return page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return 0;
    try {
      return modeler.get("elementRegistry").filter((el) => el.type === "bpmn:SubProcess").length;
    } catch {
      return 0;
    }
  });
}

async function expectSubprocessDiagramLoaded(page, { minElements = 250, minSubprocesses = 30 } = {}) {
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
      { timeout: 120_000, message: "diagram must contain 250+ elements in elementRegistry" },
    )
    .toBeGreaterThanOrEqual(minElements);
  await expect
    .poll(() => readSubprocessCount(page), { timeout: 30_000, message: "diagram must contain 30+ subprocesses" })
    .toBeGreaterThanOrEqual(minSubprocesses);
}

// Коллектор stats всех PUT /bpmn без задержки (живой сервер): duration/gap.
function collectPutBpmnStats(page) {
  const putStats = [];
  const starts = new Map();
  page.on("request", (request) => {
    if (request.method() !== "PUT" || !PUT_BPMN_URL_RE.test(new URL(request.url()).pathname)) return;
    starts.set(request, Date.now());
  });
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() !== "PUT" || !PUT_BPMN_URL_RE.test(new URL(request.url()).pathname)) return;
    const startedAt = starts.get(request);
    if (!startedAt) return;
    putStats.push({ startedAt, durationMs: Date.now() - startedAt, status: response.status() });
    starts.delete(request);
  });
  return putStats;
}

function summarizePutStats(putStats) {
  const durations = putStats.map((item) => item.durationMs).sort((a, b) => a - b);
  const gaps = putStats.slice(1).map((item, index) => item.startedAt - putStats[index].startedAt);
  const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)] : 0;
  return {
    putCount: putStats.length,
    durationsMs: durations,
    gapsMs: gaps,
    p95DurationMs: p95,
    maxGapMs: gaps.length ? Math.max(...gaps) : 0,
    conflictResponses: putStats.filter((item) => item.status === 409).length,
  };
}

test("big scheme (250+/30+ subprocesses): series of edits — zero 409, zero conflict modals", async ({ page, request }, testInfo) => {
  test.setTimeout(300_000);
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pageErrors = collectPageErrors(page);
  const conflicts409 = collectConflictResponses(page);
  const putStats = collectPutBpmnStats(page);

  const auth = await apiLogin(request, { apiBase: API_BASE, appBaseUrl: APP_BASE });
  const fixture = await createFixture(request, runId, auth.headers, makeHeavySubprocessDiagramXml());
  await openHeavySessionInPage(page, auth, fixture);
  await expectSubprocessDiagramLoaded(page);
  const elementCount = await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    return modeler ? modeler.get("elementRegistry").getAll().length : 0;
  });
  const subprocessCount = await readSubprocessCount(page);
  console.log(`[canvas-stability] big scheme loaded: elements=${elementCount} subprocesses=${subprocessCount}`);

  // Серия правок канваса; сохранение после каждых двух правок.
  const editNames = [];
  for (let i = 0; i < 6; i += 1) {
    const name = `BIG_EDIT_${i + 1}_${runId.slice(-4)}`;
    await createTaskAndType(page, name);
    editNames.push(name);
    if ((i + 1) % 2 === 0) {
      await clickToolbarSaveAndWaitSaved(page);
    }
  }
  await clickToolbarSaveAndWaitSaved(page);

  // Окно на опоздавшие 409/модалку.
  await page.waitForTimeout(2_000);
  await expectNoConflictModal(page, "big scheme series");
  expect(
    conflicts409,
    `series of edits on 250+/30+ scheme must produce zero 409 responses, got: ${JSON.stringify(conflicts409)}`,
  ).toEqual([]);

  // Правки остались на канвасе.
  for (const name of editNames) {
    await expect(
      page.locator(".bpmnStageHost .djs-container").getByText(name).first(),
      `edit '${name}' must stay on canvas`,
    ).toBeVisible();
  }

  const stats = summarizePutStats(putStats);
  console.log(`[canvas-stability] put stats:`, JSON.stringify(stats));
  await testInfo.attach("big-scheme-put-stats", {
    body: JSON.stringify({ runId, elementCount, subprocessCount, ...stats }, null, 2),
    contentType: "application/json",
  });

  expect(pageErrors).toEqual([]);
});
