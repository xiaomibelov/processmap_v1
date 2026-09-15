import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";
import { fnv1aHex } from "./helpers/bpmnFixtures.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";
const SCREENS = new URL("./screens/", import.meta.url).pathname;

function seedXml(processName, marker = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="${processName}" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Activity_1" name="Шаг ${marker}">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Финиш">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="80" y="40" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="170" y="130" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="280" y="108" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="520" y="130" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="206" y="148" /><di:waypoint x="280" y="148" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="420" y="148" /><di:waypoint x="520" y="148" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function apiJson(res, opLabel) {
  const txt = await res.text();
  let body = {};
  try {
    body = txt ? JSON.parse(txt) : {};
  } catch {
    body = { raw: txt };
  }
  expect(res.ok(), `${opLabel}: ${txt}`).toBeTruthy();
  return body;
}

async function createProjectWithSession(request, runId, headers, titleSuffix) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers,
    data: { title: `E2E compare ui ${titleSuffix} ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      headers,
      data: {
        title: `E2E compare ui session ${titleSuffix} ${runId}`,
        roles: ["Линия A"],
        start_role: "Линия A",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId };
}

async function seedVersion(request, sessionId, headers, xml, label) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const meta = await apiJson(await request.get(
      `${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/meta`,
      { headers },
    ), `get session meta ${label}`);
    const res = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
      headers,
      data: {
        xml,
        source_action: "publish_manual_save",
        base_diagram_state_version: Number(meta?.diagram_state_version ?? 0),
      },
    });
    const body = await apiJson(res, `seed ${label}`);
    if (body?.ok !== false) return body;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`seedVersion failed: ${label}`);
}

async function readSessionXml(request, sessionId, headers) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, { headers });
  expect(res.ok(), "read session bpmn").toBeTruthy();
  const xml = await res.text();
  return { xml, hash: fnv1aHex(xml), len: xml.length };
}

async function openFixture(page, fixture, auth) {
  await setUiToken(page, auth.accessToken, {
    activeOrgId: auth.activeOrgId,
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
  await waitForDiagramReady(page);
}

async function openVersionsModal(page) {
  const overflowToggle = page.getByTestId("diagram-toolbar-overflow-toggle");
  await expect(overflowToggle).toBeVisible();
  await overflowToggle.click();
  const trigger = page.getByTestId("bpmn-versions-open");
  await expect(trigger).toBeVisible();
  await trigger.evaluate((node) => node.click());
  await expect(page.getByTestId("bpmn-versions-modal")).toBeVisible();
}

async function snapshotIds(page) {
  await page.getByTestId("bpmn-version-item").first().waitFor({ state: "visible", timeout: 30_000 });
  return page.locator("[data-testid='bpmn-version-item']").evaluateAll((nodes) => {
    return nodes.map((node) => String(node.getAttribute("data-snapshot-id") || "")).filter(Boolean);
  });
}

async function getViewportTransform(page, paneIndex) {
  return page.evaluate((index) => {
    const panes = Array.from(document.querySelectorAll("[data-testid='bpmn-versions-compare-pane']"));
    const pane = panes[index];
    const viewport = pane?.querySelector("svg g.viewport");
    if (!viewport) return null;
    const transform = viewport.getAttribute("transform") || "";
    const m = transform.match(/matrix\(([^)]+)\)/);
    if (!m) return { transform };
    const [a, , , d, e, f] = m[1].split(",").map((v) => Number(String(v).trim()));
    return { scale: a === d ? a : a, tx: e, ty: f, transform };
  }, paneIndex);
}

test.describe("bpmn versions compare ui", () => {
  test("1: single preview renders diagram with header hash/author", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "single");
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "a"), 1);

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    await page.locator("[data-testid='bpmn-version-item']").first().click();
    const pane = page.getByTestId("bpmn-versions-compare-pane");
    await expect(pane).toBeVisible();
    await expect(pane.locator(".bpmnVersionPreview svg").first()).toBeVisible();
    await expect(page.getByTestId("bpmn-versions-pane-title")).toContainText("Версия 1");
    await expect(page.getByTestId("bpmn-versions-pane-hash")).not.toBeEmpty();
    await expect(pane).toContainText("·");
  });

  test("2+3: A/B compare renders two panes, legend, markers and syncs zoom", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "pair");
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "same"), 1);
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "same").replace(
      "</bpmn:process>",
      '  <bpmn:task id="Activity_2" name="Новый шаг"><bpmn:incoming>Flow_3</bpmn:incoming></bpmn:task>\n'
      + '    <bpmn:sequenceFlow id="Flow_3" sourceRef="Activity_1" targetRef="Activity_2" />\n'
      + "  </bpmn:process>",
    ).replace(
      "</bpmndi:BPMNPlane>",
      '    <bpmndi:BPMNShape id="Activity_2_di" bpmnElement="Activity_2"><dc:Bounds x="280" y="260" width="140" height="80" /></bpmndi:BPMNShape>\n'
      + '      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="350" y="188" /><di:waypoint x="350" y="260" /></bpmndi:BPMNEdge>\n'
      + "    </bpmndi:BPMNPlane>",
    ), 2);

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    const ids = await snapshotIds(page);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const olderId = ids[ids.length - 1];
    const latestId = ids[0];

    await page.locator(`[data-snapshot-id="${olderId}"] [data-testid="bpmn-version-assign-a"]`).click();
    await page.locator(`[data-snapshot-id="${latestId}"] [data-testid="bpmn-version-assign-b"]`).click();

    await expect(page.getByTestId("bpmn-versions-compare-header")).toBeVisible();
    await expect(page.getByTestId("bpmn-versions-legend-added")).toContainText(/добавлено\s*[1-9]/);
    await expect(page.getByTestId("bpmn-versions-legend-removed")).toContainText(/удалено\s*0/);
    await expect(page.getByTestId("bpmn-versions-legend-changed")).toContainText(/изменено\s*0/);
    await expect(page.getByTestId("bpmn-versions-no-changes")).toHaveCount(0);

    // Маркер добавленных элементов (задача + поток) появляется на панели B.
    await expect(page.locator(".bpmnVersionPreview .djs-element.vcc-added").first()).toBeVisible();
    await expect(page.locator("[data-testid='bpmn-versions-compare-pane']").nth(1).locator(".djs-element.vcc-added")).not.toHaveCount(0);
    // На панели A добавленных нет.
    await expect(page.locator("[data-testid='bpmn-versions-compare-pane']").nth(0).locator(".vcc-added")).toHaveCount(0);

    // Панель A — master: zoom/pan синхронизирует B (через viewport-трансформы SVG).
    const canvasA = page.locator("[data-testid='bpmn-versions-compare-pane']").nth(0).locator(".bpmnVersionPreview").first();
    await expect(canvasA).toBeVisible();
    const beforeB = await getViewportTransform(page, 1);
    expect(beforeB).not.toBeNull();
    await canvasA.hover();
    await page.mouse.wheel(0, -400);
    await page.mouse.move(10, 10);
    await page.mouse.move(60, 60);
    await expect
      .poll(async () => {
        const boxA = await getViewportTransform(page, 0);
        const boxB = await getViewportTransform(page, 1);
        if (!boxA || !boxB) return false;
        if (typeof boxA.scale !== "number" || typeof boxB.scale !== "number") return false;
        if (Math.abs(boxA.scale - boxB.scale) > 0.01) return false;
        if (Math.abs(boxA.tx - boxB.tx) > 4 || Math.abs(boxA.ty - boxB.ty) > 4) return false;
        if (typeof beforeB.scale === "number" && Math.abs(boxB.scale - beforeB.scale) < 0.01) return false;
        return true;
      }, { timeout: 15_000 })
      .toBeTruthy();
  });

  test("4: XML mode shows line diff with added/removed highlighting", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "xmlmode");
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "base"), 1);
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "target"), 2);

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    const ids = await snapshotIds(page);
    await page.locator(`[data-snapshot-id="${ids[ids.length - 1]}"] [data-testid="bpmn-version-assign-a"]`).click();
    await page.locator(`[data-snapshot-id="${ids[0]}"] [data-testid="bpmn-version-assign-b"]`).click();
    await expect(page.getByTestId("bpmn-versions-compare-header")).toBeVisible();

    await page.getByTestId("bpmn-versions-mode-xml").click();
    await expect(page.getByTestId("bpmn-versions-xml-diff").first()).toBeVisible();
    await expect(page.locator("[data-diff-kind='same']").first()).toBeVisible();
    await expect(page.locator("[data-diff-kind='removed']").first()).toBeVisible();
    await expect(page.locator("[data-diff-kind='added']").first()).toBeVisible();
    await expect(page.getByTestId("bpmn-versions-diff-truncated")).toHaveCount(0);
  });

  test("5: one version shows second-version hint", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "one");
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "only"), 1);

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    await expect(page.getByTestId("bpmn-versions-hint-second")).toBeVisible();
    await expect(page.getByTestId("bpmn-versions-hint-second")).toContainText("Выберите вторую версию для сравнения");
    await page.screenshot({ path: `${SCREENS}version-compare-1-version.png`, fullPage: false });
  });

  test("6: version XML error shows alert with retry and recovers", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "error");
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "a"), 1);
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "b"), 2);

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    const ids = await snapshotIds(page);
    const targetId = ids[0];
    await page.route(`**/api/sessions/${fixture.sessionId}/bpmn/versions/${targetId}`, (route) => route.abort());

    await page.locator(`[data-snapshot-id="${targetId}"]`).first().click();
    const alert = page.getByTestId("bpmn-versions-pane-error");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute("role", "alert");
    await page.screenshot({ path: `${SCREENS}version-compare-error.png`, fullPage: false });

    await page.unroute(`**/api/sessions/${fixture.sessionId}/bpmn/versions/${targetId}`);
    // Повторная загрузка: поднимаем новый запрос через кнопку «Повторить».
    await page.route(`**/api/sessions/${fixture.sessionId}/bpmn/versions/${targetId}`, (route) => route.continue());
    await page.getByTestId("bpmn-versions-pane-retry").click();
    await expect(page.getByTestId("bpmn-versions-compare-pane").locator(".bpmnVersionPreview svg").first()).toBeVisible();
  });

  test("7: restore uses inline confirmation and refreshes the list", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "restore");
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "first"), 1);
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "second"), 2);

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    const restorePosts = [];
    page.on("request", (req) => {
      if (req.method() !== "POST") return;
      if (!/\/api\/sessions\/[^/]+\/bpmn\/restore\//.test(req.url())) return;
      restorePosts.push(req.postDataJSON?.() || {});
    });

    const ids = await snapshotIds(page);
    const firstVersionId = ids[ids.length - 1];
    await page.locator(`[data-snapshot-id="${firstVersionId}"]`).first().click();
    await page.getByTestId("bpmn-versions-pane-restore").click();
    await expect(page.getByTestId("bpmn-versions-pane-restore-confirm")).toBeVisible();
    // Отмена снимает подтверждение.
    await page.getByTestId("bpmn-versions-pane-restore-cancel").click();
    await expect(page.getByTestId("bpmn-versions-pane-restore-confirm")).toHaveCount(0);
    // Повторно: подтверждаем. Restore уходит на сервер с base_diagram_state_version (CAS).
    await page.getByTestId("bpmn-versions-pane-restore").click();
    await page.getByTestId("bpmn-versions-pane-restore-apply").click();

    await expect.poll(() => restorePosts.length, { timeout: 30_000 }).toBe(1);
    expect(Number(restorePosts[0]?.base_diagram_state_version)).toBeGreaterThanOrEqual(0);
    // Список версий обновился (появилась версия restore).
    await expect
      .poll(async () => (await snapshotIds(page)).length, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(3);
  });

  test("7a: stale base_diagram_state_version shows conflict and never overwrites the diagram", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "cas");
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "keepme"), 1);

    const before = await readSessionXml(request, fixture.sessionId, auth.headers);
    expect(before.len).toBeGreaterThan(0);

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    const restoreRequests = [];
    await page.route(`**/api/sessions/${fixture.sessionId}/bpmn/restore/*`, (route) => {
      restoreRequests.push(route.request().url());
      // Воспроизводим 409 DIAGRAM_STATE_CONFLICT: сервер отклонил устаревшее состояние схемы.
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: "diagram_state_conflict",
          code: "DIAGRAM_STATE_CONFLICT",
          detail: "diagram state version is stale",
        }),
      });
    });

    const ids = await snapshotIds(page);
    await page.locator(`[data-snapshot-id="${ids[0]}"]`).first().click();
    await page.getByTestId("bpmn-versions-pane-restore").click();
    await page.getByTestId("bpmn-versions-pane-restore-apply").click();

    // Ошибка конфликта версий видна пользователю (устаревшее состояние схемы).
    await expect(page.getByText(/требуется обновить состояние схемы|изменилась после открытия истории версий/i)).toBeVisible({ timeout: 30_000 });

    // Ровно один restore POST, без авто-ретраев.
    await page.waitForTimeout(1500);
    expect(restoreRequests.length).toBe(1);

    // Текущий XML диаграммы не перезаписан (byte-identical до/после).
    const after = await readSessionXml(request, fixture.sessionId, auth.headers);
    expect(after.hash).toBe(before.hash);
    expect(after.len).toBe(before.len);
  });

  test("8: keyboard navigation assigns pair via A/B keys", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "keyboard");
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "k1"), 1);
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "k2"), 2);

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    const ids = await snapshotIds(page);
    const cards = page.getByTestId("bpmn-version-item");
    await cards.nth(0).click();
    await expect(cards.nth(0)).toHaveAttribute("tabindex", "0");
    await cards.nth(0).press("ArrowDown");
    await expect(cards.nth(1)).toHaveAttribute("tabindex", "0");
    await expect(page.locator("[data-testid='bpmn-version-item'][tabindex='0']")).toHaveAttribute(
      "data-snapshot-id",
      ids[1],
    );
    // Enter открывает предпросмотр второй версии.
    await cards.nth(1).press("Enter");
    await expect(page.getByTestId("bpmn-versions-pane-title")).toContainText("Версия 1");
    // A на активной карточке назначает слот A.
    await cards.nth(1).press("a");
    await page.locator(`[data-snapshot-id="${ids[0]}"]`).click();
    await page.locator(`[data-snapshot-id="${ids[0]}"]`).press("b");
    await expect(page.getByTestId("bpmn-versions-compare-header")).toBeVisible();
  });

  test("9+3: 20+ versions list with pagination and compare screenshot", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "many");
    for (let i = 1; i <= 22; i += 1) {
      await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", `m${i}`), i);
    }

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    const shownCount = page.getByTestId("bpmn-versions-shown-count");
    await expect(shownCount).toContainText(/Показано 10 из 22/);
    await page.getByTestId("bpmn-versions-load-more").click();
    await expect(shownCount).toContainText(/Показано 20 из 22/);
    await page.getByTestId("bpmn-versions-load-more").click();
    await expect(shownCount).toContainText(/Показано 22 из 22/);
    await expect(page.getByTestId("bpmn-versions-load-more")).toHaveCount(0);
    await expect(page.locator("text=Все версии загружены")).toBeVisible();
    await page.screenshot({ path: `${SCREENS}version-compare-20-plus.png`, fullPage: false });

    // Скролл списка работает (лист внутри модалки).
    const listBox = page.getByTestId("bpmn-versions-modal").locator("[role='listbox']").first();
    await listBox.evaluate((node) => { node.scrollTop = 4000; });
    await expect
      .poll(async () => listBox.evaluate((node) => node.scrollTop), { timeout: 5000 })
      .toBeGreaterThan(100);
  });

  test("empty diff shows no-changes plate and screenshot", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "emptydiff");
    // Две версии с семантически идентичным BPMN: отличаются только DI-координатой
    // (backend создаёт версию, семантический diff по id/name — пустой).
    const sameXml = seedXml("P", "same");
    await seedVersion(request, fixture.sessionId, auth.headers, sameXml, 1);
    await seedVersion(request, fixture.sessionId, auth.headers, sameXml.replace(
      '<dc:Bounds x="280" y="108" width="140" height="80" />',
      '<dc:Bounds x="292" y="108" width="140" height="80" />',
    ), 2);

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    const ids = await snapshotIds(page);
    await page.locator(`[data-snapshot-id="${ids[ids.length - 1]}"] [data-testid="bpmn-version-assign-a"]`).click();
    await page.locator(`[data-snapshot-id="${ids[0]}"] [data-testid="bpmn-version-assign-b"]`).click();
    await expect(page.getByTestId("bpmn-versions-no-changes")).toBeVisible();
    await expect(page.getByTestId("bpmn-versions-no-changes")).toContainText("Изменений не найдено");
    await expect(page.locator(".bpmnVersionPreview .vcc-added, .bpmnVersionPreview .vcc-removed, .bpmnVersionPreview .vcc-changed")).toHaveCount(0);
    await page.screenshot({ path: `${SCREENS}version-compare-empty-diff.png`, fullPage: false });
  });

  test("two-version compare screenshot with legend and markers", async ({ page, request }) => {
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const auth = await apiLogin(request, { apiBase: API_BASE });
    const fixture = await createProjectWithSession(request, runId, auth.headers, "shot2");
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "shot"), 1);
    await seedVersion(request, fixture.sessionId, auth.headers, seedXml("P", "shot").replace(
      "</bpmn:process>",
      '  <bpmn:task id="Activity_9" name="Доп шаг"><bpmn:incoming>Flow_9</bpmn:incoming></bpmn:task>\n'
      + '    <bpmn:sequenceFlow id="Flow_9" sourceRef="Activity_1" targetRef="Activity_9" />\n'
      + "  </bpmn:process>",
    ).replace(
      "</bpmndi:BPMNPlane>",
      '    <bpmndi:BPMNShape id="Activity_9_di" bpmnElement="Activity_9"><dc:Bounds x="280" y="260" width="140" height="80" /></bpmndi:BPMNShape>\n'
      + '      <bpmndi:BPMNEdge id="Flow_9_di" bpmnElement="Flow_9"><di:waypoint x="350" y="188" /><di:waypoint x="350" y="260" /></bpmndi:BPMNEdge>\n'
      + "    </bpmndi:BPMNPlane>",
    ), 2);

    await openFixture(page, fixture, auth);
    await openVersionsModal(page);

    const ids = await snapshotIds(page);
    await page.locator(`[data-snapshot-id="${ids[ids.length - 1]}"] [data-testid="bpmn-version-assign-a"]`).click();
    await page.locator(`[data-snapshot-id="${ids[0]}"] [data-testid="bpmn-version-assign-b"]`).click();
    await expect(page.getByTestId("bpmn-versions-compare-header")).toBeVisible();
    await expect(page.locator(".bpmnVersionPreview .djs-element.vcc-added").first()).toBeVisible();
    await page.screenshot({ path: `${SCREENS}version-compare-2-versions.png`, fullPage: false });
  });
});
