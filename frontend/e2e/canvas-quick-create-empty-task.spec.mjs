// E2E-спека контура fix/canvas-quick-create-422-ghost-naming.
//
// Симптомы (stage, подтверждено владельцем):
//   S1. quick-create ПУСТОЙ таски (палитра) → баннер «Изменение не поддержано
//       дельта-сохранением» (ops-unsupported): сервер отклонил op из POST /operations.
//   S2. GHOST-NAMING: после reload пустая таска САМА получает имя «Шаг 1»
//       (константа, не счётчик). Имя материализуется только после round-trip.
//
// Эталон:
//   - quick-create пустой таски → op принят сервером (200) ЛИБО честный full-save;
//     баннера ops-unsupported НЕТ.
//   - после reload пустая таска остаётся БЕЗЫМЯННОЙ (BPMN допускает отсутствие name).
//
// Прогон (worktree-стек wt-cqc422ghost, host):
//   E2E_APP_BASE_URL=http://localhost:41177 E2E_API_BASE_URL=http://localhost:41011 \
//     npx playwright test e2e/canvas-quick-create-empty-task.spec.mjs

import { expect, test } from "@playwright/test";

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, createFixture, openFixture, seedXml } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

const UNSUPPORTED_BANNER_RE = /не поддержано дельта-сохранением/i;
const GHOST_NAME_RE = /^Шаг\s*\d+$/i;

async function listTaskElements(page) {
  return page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    const registry = modeler.get("elementRegistry");
    const tasks = registry
      .filter((el) => /^(bpmn:)?(userTask|task|serviceTask|manualTask|scriptTask|businessRuleTask|sendTask|receiveTask)$/i.test(String(el?.type || "")))
      .map((el) => ({ id: el.id, type: el.type, name: (el.businessObject?.name ?? null) }));
    return { ok: true, tasks };
  });
}

async function dragTaskFromPalette(page, dropX, dropY) {
  const entry = page.locator(".djs-palette .entry[data-action='create.task']").first();
  await expect(entry, "palette entry create.task").toBeVisible();
  const box = await entry.boundingBox();
  if (!box) throw new Error("palette entry bounding box missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropX, dropY, { steps: 16 });
  await page.mouse.up();
}

async function serverXml(request, headers, sessionId) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, { headers });
  expect(res.ok(), `GET bpmn: ${await res.text()}`).toBeTruthy();
  // GET /bpmn отдаёт raw XML (не JSON) — принимаем оба представления.
  const text = await res.text();
  try {
    return String(JSON.parse(text)?.xml || text);
  } catch {
    return text;
  }
}

test("quick-create пустой таски: op принят, баннера ops-unsupported нет; после reload таска безымянная", async ({ page, request }) => {
  test.setTimeout(180_000);
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const headers = auth.headers;
  const fixture = await createFixture(request, `cqc422-${Date.now()}`, headers, seedXml());
  const sessionId = fixture.sessionId;

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));

  // Wire-capture: какой op ушёл и что ответил сервер.
  const operationsLog = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (!/\/api\/sessions\/[^/]+\/operations$/.test(url)) return;
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    operationsLog.push({ status: response.status(), body });
  });
  const putBpmnLog = [];
  page.on("response", (response) => {
    if (/\/api\/sessions\/[^/]+\/bpmn$/.test(response.url())) putBpmnLog.push(response.status());
  });

  await setUiToken(page, auth.accessToken, {
    activeOrgId: auth.activeOrgId,
    appBaseUrl: process.env.E2E_APP_BASE_URL,
  });
  await openFixture(page, fixture);
  await waitForDiagramReady(page);

  const before = await listTaskElements(page);
  expect(before.ok, JSON.stringify(before)).toBeTruthy();
  // Гонка импорта: viewport появляется раньше, чем registry наполняется.
  await expect
    .poll(async () => (await listTaskElements(page)).tasks.length, { timeout: 30000, message: "seed task Task_1 in registry" })
    .toBeGreaterThan(0);
  const beforeStable = await listTaskElements(page);
  expect(beforeStable.tasks.map((t) => t.id)).toEqual(["Task_1"]);

  // Quick-create ПУСТОЙ таски из палитры — реальная мышь.
  await dragTaskFromPalette(page, 700, 400);
  await page.waitForTimeout(1500);

  const after = await listTaskElements(page);
  expect(after.ok, JSON.stringify(after)).toBeTruthy();
  const created = after.tasks.filter((t) => t.id !== "Task_1");
  expect(created.length, `created tasks: ${JSON.stringify(after.tasks)}`).toBe(1);
  const createdId = created[0].id;

  // S1: баннера ops-unsupported НЕТ; wire — в evidence.
  await expect(page.locator("body")).not.toContainText(UNSUPPORTED_BANNER_RE);
  const badOps = operationsLog.filter((e) => e.status !== 200);
  expect(badOps, `rejected operations: ${JSON.stringify(badOps)}`).toEqual([]);
  expect(operationsLog.length + putBpmnLog.length, "ни ops, ни full-save не ушли").toBeGreaterThan(0);

  // Живой canvas: таска безымянная (до reload — тоже).
  expect(String(created[0].name ?? ""), `live name of ${createdId}`).toBe("");

  // S2: reload → таска остаётся безымянной (canvas и серверный XML).
  await page.reload();
  await waitForDiagramReady(page);
  await page.waitForTimeout(1500);

  const reloaded = await listTaskElements(page);
  expect(reloaded.ok, JSON.stringify(reloaded)).toBeTruthy();
  const reloadedCreated = reloaded.tasks.find((t) => t.id === createdId);
  expect(reloadedCreated, `task ${createdId} after reload`).toBeTruthy();
  expect(String(reloadedCreated.name ?? ""), `GHOST-NAMING: name materialized after reload: ${JSON.stringify(reloadedCreated)}`).toBe("");
  expect(GHOST_NAME_RE.test(String(reloadedCreated.name ?? "")), "ghost name «Шаг N»").toBe(false);

  const xml = await serverXml(request, headers, sessionId);
  const ghostHits = [...xml.matchAll(/name="(Шаг\s*\d+)"/g)].map((m) => m[1]);
  expect(ghostHits, `server XML carries ghost names: ${JSON.stringify(ghostHits)}`).toEqual([]);

  expect(pageErrors, `pageerrors: ${JSON.stringify(pageErrors)}`).toEqual([]);
  console.log(JSON.stringify({ wire: { operationsLog, putBpmnLog }, createdId, pageErrors }, null, 2));
});

test("ПРИЁМКА: quick-create ×3 пустых таски + burst-правки → 0 баннеров → reload → все безымянные → 0 pageerrors", async ({ page, request }) => {
  test.setTimeout(300_000);
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const headers = auth.headers;
  const fixture = await createFixture(request, `cqc422acc-${Date.now()}`, headers, seedXml());
  const sessionId = fixture.sessionId;

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));
  const operationsLog = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (!/\/api\/sessions\/[^/]+\/operations$/.test(url)) return;
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    operationsLog.push({ status: response.status(), body });
  });

  await setUiToken(page, auth.accessToken, {
    activeOrgId: auth.activeOrgId,
    appBaseUrl: process.env.E2E_APP_BASE_URL,
  });
  await openFixture(page, fixture);
  await waitForDiagramReady(page);
  await expect
    .poll(async () => (await listTaskElements(page)).tasks.length, { timeout: 30000, message: "seed task Task_1 in registry" })
    .toBeGreaterThan(0);

  // quick-create ×3 пустых таски (палитра, реальная мышь).
  const createdIds = [];
  for (let i = 0; i < 3; i += 1) {
    await dragTaskFromPalette(page, 640 + i * 220, 380 + (i % 2) * 120);
    await page.waitForTimeout(800);
    const now = await listTaskElements(page);
    const fresh = now.tasks.filter((t) => t.id !== "Task_1" && !createdIds.includes(t.id));
    expect(fresh.length, `iteration ${i}: ${JSON.stringify(now.tasks)}`).toBe(1);
    createdIds.push(fresh[0].id);
  }

  // burst-правки: rename одной, move двух (modeling-API поверх ops-канала).
  await page.evaluate(({ id }) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler.get("elementRegistry");
    const modeling = modeler.get("modeling");
    modeling.updateLabel(registry.get(id), "Проверка ОТК");
  }, { id: createdIds[0] });
  await page.evaluate(({ id }) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const registry = modeler.get("elementRegistry");
    const modeling = modeler.get("modeling");
    modeling.moveElements([registry.get(id)], { x: 40, y: -30 });
  }, { id: createdIds[1] });
  await page.waitForTimeout(2500);

  // 0 баннеров ops-unsupported, 0 rejected ops.
  await expect(page.locator("body")).not.toContainText(UNSUPPORTED_BANNER_RE);
  const badOps = operationsLog.filter((e) => e.status !== 200);
  expect(badOps, `rejected operations: ${JSON.stringify(badOps)}`).toEqual([]);

  // reload → все три quick-create таски БЕЗЫМЯННЫ (rename'нутая сохраняет имя).
  await page.reload();
  await waitForDiagramReady(page);
  await page.waitForTimeout(1500);

  const reloaded = await listTaskElements(page);
  expect(reloaded.ok, JSON.stringify(reloaded)).toBeTruthy();
  const byId = new Map(reloaded.tasks.map((t) => [t.id, t]));
  for (const id of createdIds.slice(1)) {
    const t = byId.get(id);
    expect(t, `task ${id} present after reload`).toBeTruthy();
    expect(String(t.name ?? ""), `GHOST-NAMING after reload: ${JSON.stringify(t)}`).toBe("");
  }
  expect(String(byId.get(createdIds[0])?.name ?? ""), "renamed task keeps its name").toBe("Проверка ОТК");

  const xml = await serverXml(request, headers, sessionId);
  const ghostHits = [...xml.matchAll(/name="(Шаг\s*\d+)"/g)].map((m) => m[1]);
  expect(ghostHits, `server XML carries ghost names: ${JSON.stringify(ghostHits)}`).toEqual([]);

  expect(pageErrors, `pageerrors: ${JSON.stringify(pageErrors)}`).toEqual([]);
  console.log(JSON.stringify({ wire: operationsLog, createdIds, pageErrors }, null, 2));
});
