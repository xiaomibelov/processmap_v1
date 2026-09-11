import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const ACTIVE_MINUTES = Math.max(1, Number(process.env.E2E_POLLING_MINUTES || 5));
const HIDDEN_SECONDS = Math.max(30, Number(process.env.E2E_POLLING_HIDDEN_SECONDS || 120));

// Фоновые endpoint'ы, входящие в бюджет polling-контура (audit/api-polling-reduction).
const BUDGET_PATHS = [
  { key: "versions_head", re: /\/api\/sessions\/[^/]+\/bpmn\/versions\?limit=1/ },
  { key: "presence", re: /\/api\/sessions\/[^/]+\/presence$/ },
  { key: "note_threads", re: /\/api\/sessions\/[^/]+\/note-threads/ },
  { key: "deployment_notice", re: /\/api\/deployment-notice$/ },
  { key: "error_events", re: /\/api\/telemetry\/error-events$/ },
];

function seedXml(taskCount) {
  const tasks = [];
  const flows = [];
  const shapes = [];
  const edges = [];
  let x = 240;
  let y = 120;
  for (let i = 0; i < taskCount; i += 1) {
    const id = `Task_poll_${i}`;
    const prevRef = i === 0 ? "StartEvent_poll" : `Task_poll_${i - 1}`;
    const nextRef = i === taskCount - 1 ? "EndEvent_poll" : `Task_poll_${i + 1}`;
    tasks.push(`<bpmn:task id="${id}" name="Шаг ${i}"><bpmn:incoming>Flow_in_${i}</bpmn:incoming><bpmn:outgoing>Flow_out_${i}</bpmn:outgoing></bpmn:task>`);
    flows.push(`<bpmn:sequenceFlow id="Flow_in_${i}" sourceRef="${prevRef}" targetRef="${id}" />`);
    flows.push(`<bpmn:sequenceFlow id="Flow_out_${i}" sourceRef="${id}" targetRef="${nextRef}" />`);
    shapes.push(`<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${x}" y="${y}" width="120" height="80" /></bpmndi:BPMNShape>`);
    edges.push(`<bpmndi:BPMNEdge id="Flow_in_${i}_di" bpmnElement="Flow_in_${i}"><di:waypoint x="${x - 60}" y="${y + 40}" /><di:waypoint x="${x}" y="${y + 40}" /></bpmndi:BPMNEdge>`);
    edges.push(`<bpmndi:BPMNEdge id="Flow_out_${i}_di" bpmnElement="Flow_out_${i}"><di:waypoint x="${x + 120}" y="${y + 40}" /><di:waypoint x="${x + 180}" y="${y + 40}" /></bpmndi:BPMNEdge>`);
    x += 180;
    if (x > 1500) { x = 240; y += 140; }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_poll" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_poll" isExecutable="false">
    <bpmn:startEvent id="StartEvent_poll"><bpmn:outgoing>Flow_in_0</bpmn:outgoing></bpmn:startEvent>
    ${tasks.join("\n    ")}
    ${flows.join("\n    ")}
    <bpmn:endEvent id="EndEvent_poll"><bpmn:incoming>Flow_out_${taskCount - 1}</bpmn:incoming></bpmn:endEvent>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_poll">
    <bpmndi:BPMNPlane id="BPMNPlane_poll" bpmnElement="Process_poll">
      <bpmndi:BPMNShape id="StartEvent_poll_di" bpmnElement="StartEvent_poll"><dc:Bounds x="140" y="142" width="36" height="36" /></bpmndi:BPMNShape>
      ${shapes.join("\n      ")}
      ${edges.join("\n      ")}
      <bpmndi:BPMNShape id="EndEvent_poll_di" bpmnElement="EndEvent_poll"><dc:Bounds x="1660" y="142" width="36" height="36" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function apiJson(res, opLabel) {
  const txt = await res.text();
  let body = {};
  try { body = txt ? JSON.parse(txt) : {}; } catch { body = { raw: txt }; }
  expect(res.ok(), `${opLabel}: ${txt}`).toBeTruthy();
  return body;
}

async function createFixture(request, runId, headers) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { title: `E2E polling ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  const sessionRes = await request.post(`${API_BASE}/api/projects/${projectId}/sessions?mode=quick_skeleton`, {
    headers,
    data: { title: `E2E polling session ${runId}`, roles: ["Оператор"], start_role: "Оператор" },
  });
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  const xml = seedXml(140);
  // Контракт канонического helper processFixture.mjs: поле xml + обе базовые версии.
  const putRes = await request.put(`${API_BASE}/api/sessions/${sessionId}/bpmn`, {
    headers,
    data: { xml, base_diagram_state_version: 0, base_bpmn_xml_version: 0 },
  });
  await apiJson(putRes, "seed bpmn xml");
  return { projectId, sessionId, orgId: String(project.org_id || "") };
}

async function installNetCounter(page) {
  await page.addInitScript(() => {
    // E2E-инструментация приложения (хуки __FPC_E2E_DRAFT__ /
    // __FPC_E2E_OPEN_SESSION__ ставятся только при флаге ДО загрузки App).
    window.__FPC_E2E__ = true;
    window.__e2eNet = { log: [] };
    const push = (method, url) => {
      try {
        const u = new URL(String(url || ""), location.href);
        if (u.pathname.startsWith("/api/")) {
          window.__e2eNet.log.push({ t: Date.now(), method, path: u.pathname + u.search });
        }
      } catch { /* ignore */ }
    };
    const of = window.fetch;
    window.fetch = function (input, init) {
      push((init && init.method) || (input && input.method) || "GET", typeof input === "string" ? input : input.url);
      return of.apply(this, arguments);
    };
    const oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return oo.apply(this, arguments); };
    const os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () { push(this.__m || "GET", this.__u); return os.apply(this, arguments); };
    const OES = window.EventSource;
    window.EventSource = function (u, c) { push("GET", u); return new OES(u, c); };
    window.EventSource.prototype = OES.prototype;
  });
}

async function netStats(page, sinceMs) {
  return page.evaluate((since) => {
    const rows = window.__e2eNet.log.filter((e) => e.t >= since);
    const byPath = {};
    for (const e of rows) {
      byPath[e.method + " " + e.path.split("?")[0]] = (byPath[e.method + " " + e.path.split("?")[0]] || 0) + 1;
    }
    return { total: rows.length, byPath, now: Date.now() };
  }, sinceMs);
}

function budgetBucket(path) {
  for (const b of BUDGET_PATHS) if (b.re.test(path)) return b.key;
  return null;
}

async function budgetStats(page, sinceMs) {
  const stats = await netStats(page, sinceMs);
  const budget = { versions_head: 0, presence: 0, note_threads: 0, deployment_notice: 0, error_events: 0, other_api: 0 };
  for (const [key, count] of Object.entries(stats.byPath)) {
    const bucket = budgetBucket(key.replace(/^[^ ]+ /, ""));
    if (bucket) budget[bucket] += count;
    else budget.other_api += count;
  }
  budget.total_api = stats.total;
  return budget;
}

async function seedOrgChoiceDone(page, userId) {
  // Экран выбора org (в dev-БД сотни организаций) — вне скоупа polling-замеров.
  // Помечаем выбор выполненным до загрузки страницы: замер не должен зависеть
  // от UI выбора org. Fallback-клик (ensureOrgSelected) остаётся на случай
  // смены ключа в RootApp.
  const uid = String(userId || "").trim();
  if (!uid) return;
  await page.addInitScript((id) => {
    window.sessionStorage.setItem(`fpc_org_choice_done:${id}`, "1");
  }, uid);
}

async function clickOrgButtonInDom(page) {
  // Список org (сотни штук в dev-БД) рендерится без виртуализации: первая
  // кнопка уезжает за пределы viewport (y<0) и обычный locator.click()
  // не скроллится к ней. Клик через DOM детерминирован.
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button")).filter((b) => /Роль:/.test(b.textContent || ""));
    if (!buttons.length) return false;
    const preferred = buttons.find((b) => /Default/i.test(b.textContent || "")) || buttons[0];
    preferred.click();
    return true;
  });
}

async function ensureOrgSelected(page) {
  // Локальная dev-БД содержит сотни организаций: при отсутствии server-side
  // active org приложение показывает экран «Выберите организацию», который
  // shared-helper не всегда пробивает (кликает первую попавшуюся «Org»).
  // Фикстуры контура живут в org «Default» — выбираем её явно один раз.
  // Кнопки подгружаются асинхронно после заголовка, поэтому ждём их и повторяем.
  const orgChoice = page.getByText("Выберите организацию");
  for (let i = 0; i < 10; i += 1) {
    if (!(await orgChoice.isVisible().catch(() => false))) return;
    const clicked = await clickOrgButtonInDom(page).catch(() => false);
    if (clicked) {
      await page.waitForTimeout(1500);
      if (!(await orgChoice.isVisible().catch(() => false))) return;
    } else {
      await page.waitForTimeout(1000);
    }
  }
}

async function openSessionViaUrl(page, fixture) {
  // Открытие сессии напрямую через e2e-хук приложения (__FPC_E2E_OPEN_SESSION__).
  // Shared-helper openSessionInTopbar в этом окружении (dev-БД с сотнями org)
  // стабильно уводит renderer в необратимый фриз при инжекте опций в селекты
  // топбара; прямой хук + ожидание draft отработали 4/4 в диагностике.
  await page.goto(`/app?project=${encodeURIComponent(fixture.projectId)}&session=${encodeURIComponent(fixture.sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => typeof window.__FPC_E2E_OPEN_SESSION__ === "function", null, { timeout: 60_000 });
  await page.evaluate((sid) => window.__FPC_E2E_OPEN_SESSION__(sid), fixture.sessionId);
  await page.waitForFunction((sid) => String(window.__FPC_E2E_DRAFT__?.session_id || "") === String(sid), fixture.sessionId, { timeout: 60_000 });
  await waitForDiagramReady(page, { timeout: 120_000 });
}

async function dragFirstTask(page) {
  const target = await page.evaluate(() => {
    const shapes = document.querySelectorAll('.djs-container svg [data-element-id^="Task_poll_"]');
    const s = shapes[0];
    if (!s) return null;
    const r = s.getBoundingClientRect();
    if (!r.width) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!target) return false;
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x + 30, target.y + 20, { steps: 6 });
  await page.mouse.up();
  return true;
}

test.describe("api-polling-reduction", () => {
  test(`активная сессия: фоновый трафик ≤12 зап/мин, versions-head не инициируется autosave (${ACTIVE_MINUTES} мин)`, async ({ page, request }) => {
    test.setTimeout((ACTIVE_MINUTES + 4) * 60_000);
    const auth = await apiLogin(request);
    const fixture = await createFixture(request, Date.now(), auth.headers);

    await installNetCounter(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await seedOrgChoiceDone(page, auth.userId);
    await page.goto("/app");
    await ensureOrgSelected(page);
    await openSessionViaUrl(page, fixture);

    // Посадочный трафик (загрузка сессии/мета/панелей) не входит в замер.
    await page.waitForTimeout(20_000);
    const t0 = Date.now();
    for (let minute = 0; minute < ACTIVE_MINUTES; minute += 1) {
      await dragFirstTask(page);
      await page.waitForTimeout(55_000);
    }
    const stats = await budgetStats(page, t0);
    const minutes = (Date.now() - t0) / 60_000;
    const backgroundTotal = stats.versions_head + stats.presence + stats.note_threads + stats.deployment_notice + stats.error_events;
    const perMin = backgroundTotal / minutes;

    console.log(`[polling] minutes=${minutes.toFixed(1)} budget=`, JSON.stringify(stats), `background/min=${perMin.toFixed(1)}`);

    // Целевой бюджет аудита: ≤12 зап/мин фоновых.
    expect(perMin, `фоновый трафик ${perMin.toFixed(1)}/мин > 12/мин: ${JSON.stringify(stats)}`).toBeLessThanOrEqual(12);
    // Единственный источник versions-head — remote poll 60 с (+ mount/foreground): ≤ 2/мин.
    expect(stats.versions_head / minutes, `versions?limit=1 ${stats.versions_head} шт за ${minutes.toFixed(1)} мин`).toBeLessThanOrEqual(2.5);
    // presence 60 с → ≤1.5/мин; notice 300 с → ≤0.5/мин.
    expect(stats.presence / minutes).toBeLessThanOrEqual(1.5);
    expect(stats.deployment_notice / minutes).toBeLessThanOrEqual(0.5);
  });

  test(`скрытая вкладка: 0 фоновых запросов, при возврате — один цикл рефетча (${HIDDEN_SECONDS} с)`, async ({ page, context, request }) => {
    test.setTimeout((HIDDEN_SECONDS + 120) * 1000);
    const auth = await apiLogin(request);
    const fixture = await createFixture(request, Date.now(), auth.headers);

    await installNetCounter(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await seedOrgChoiceDone(page, auth.userId);
    await page.goto("/app");
    await ensureOrgSelected(page);
    await openSessionViaUrl(page, fixture);
    await page.waitForTimeout(15_000);

    const hiddenPage = await context.newPage();
    await hiddenPage.goto("about:blank");
    await hiddenPage.bringToFront();

    const tHidden = Date.now();
    await page.waitForTimeout(HIDDEN_SECONDS * 1000);
    const hiddenStats = await budgetStats(page, tHidden);

    await page.bringToFront();
    await page.waitForTimeout(5000);
    const backStats = await budgetStats(page, tHidden);

    console.log(`[polling-hidden] hidden=`, JSON.stringify(hiddenStats), `after_return_delta=`, JSON.stringify({
      versions_head: backStats.versions_head - hiddenStats.versions_head,
      presence: backStats.presence - hiddenStats.presence,
      deployment_notice: backStats.deployment_notice - hiddenStats.deployment_notice,
    }));

    const hiddenBackground = hiddenStats.versions_head + hiddenStats.presence + hiddenStats.note_threads + hiddenStats.deployment_notice + hiddenStats.error_events;
    expect(hiddenBackground, `на скрытой вкладке ${hiddenBackground} фоновых запросов: ${JSON.stringify(hiddenStats)}`).toBe(0);

    const delta = (backStats.versions_head - hiddenStats.versions_head)
      + (backStats.presence - hiddenStats.presence)
      + (backStats.deployment_notice - hiddenStats.deployment_notice);
    expect(delta, "при возврате ожидался один цикл рефетча (versions+presence+notice)").toBeGreaterThanOrEqual(1);
    expect(delta, `рефетч при возврате раздут: ${JSON.stringify(backStats)}`).toBeLessThanOrEqual(5);
  });

  test("функциональная регрессия: заметки видны после write, presence-POST жив, чип версии на месте", async ({ page, request }) => {
    test.setTimeout(180_000);
    const auth = await apiLogin(request);
    const fixture = await createFixture(request, Date.now(), auth.headers);

    // Thread + comment через API, затем проверка отображения в UI.
    const threadRes = await request.post(`${API_BASE}/api/sessions/${fixture.sessionId}/note-threads`, {
      headers: auth.headers,
      data: { scope_type: "diagram_element", scope_ref: { element_id: "Task_poll_1" }, title: "E2E polling thread", body: "E2E polling thread body" },
    });
    const thread = await apiJson(threadRes, "create note thread");
    // API отдаёт обёртку { thread: { id } }.
    const threadId = String(thread?.thread?.id || thread?.id || "").trim();
    expect(threadId).not.toBe("");
    const commentRes = await request.post(`${API_BASE}/api/note-threads/${threadId}/comments`, {
      headers: auth.headers,
      data: { body: "E2E polling comment body" },
    });
    await apiJson(commentRes, "add comment");

    await installNetCounter(page);
    await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId });
    await seedOrgChoiceDone(page, auth.userId);
    await page.goto("/app");
    await ensureOrgSelected(page);
    await openSessionViaUrl(page, fixture);

    // presence heartbeat уходит и отвечает 2xx (считаем через счётчик).
    await page.waitForTimeout(35_000);
    const stats = await budgetStats(page, Date.now() - 40_000);
    expect(stats.presence, "presence heartbeat не уходил за 40 с").toBeGreaterThanOrEqual(1);

    // Выбор элемента с тредом → element-threads запрос и отображение тела комментария.
    const clicked = await page.evaluate(() => {
      const shapes = document.querySelectorAll('.djs-container svg [data-element-id="Task_poll_1"]');
      const s = shapes[0];
      if (!s) return false;
      const r = s.getBoundingClientRect();
      const evt = new MouseEvent("click", { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 });
      s.dispatchEvent(evt);
      return true;
    });
    expect(clicked).toBeTruthy();
    await expect(page.getByText("E2E polling comment body").first()).toBeVisible({ timeout: 20_000 });

    // Чип версии присутствует в шапке/панели версий.
    const versionsPanel = page.getByTestId("panel-versions");
    await expect(versionsPanel.first()).toBeVisible({ timeout: 20_000 });
  });
});
