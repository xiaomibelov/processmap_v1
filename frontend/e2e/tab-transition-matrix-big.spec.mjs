import { expect, test } from "@playwright/test";
import { fnv1aHex, hasDiMarkers, makeBigDiagramXml, makeMatrixCases } from "./helpers/bpmnFixtures.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

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

async function createFixture(request, runId, xmlText) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E big matrix project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E big matrix session ${runId}`,
        roles: ["Lane 1", "Lane 2", "Lane 3"],
        start_role: "Lane 1",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");

  const putRes = await request.put(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/bpmn`, {
    data: { xml: xmlText },
  });
  await apiJson(putRes, "seed bpmn");

  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openFixture(page, fixture, options = {}) {
  if (!options?.skipInit) {
    await page.addInitScript(() => {
      window.__FPC_E2E__ = true;
      window.localStorage.setItem("fpc_debug_bpmn", "1");
      window.localStorage.setItem("fpc_debug_tabs", "1");
      window.localStorage.setItem("fpc_debug_trace", "1");
      window.localStorage.setItem("fpc_debug_snapshots", "1");
    });
  }
  if (!options?.skipGoto) await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

async function assertDiagramVisible(page, label) {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
        if (!modeler) return { ok: false, registryCount: -1, svgRect: "0x0" };
        const registry = modeler.get("elementRegistry");
        const count = Array.isArray(registry?.getAll?.()) ? registry.getAll().length : 0;
        const canvas = modeler.get("canvas");
        const svg = canvas?._container?.querySelector?.("svg");
        const rect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
        const w = Math.round(Number(rect.width || 0));
        const h = Math.round(Number(rect.height || 0));
        return {
          ok: count > 0 && w > 0 && h > 0,
          registryCount: count,
          svgRect: `${w}x${h}`,
        };
      });
    }, label)
    .toMatchObject({ ok: true });
}

async function readXmlFromEditor(page) {
  await switchTab(page, "XML");
  const area = page.locator(".xmlEditorTextarea");
  await expect(area).toBeVisible();
  const xml = await area.inputValue();
  return {
    xml,
    hash: fnv1aHex(xml),
    len: xml.length,
  };
}

async function readXmlFromDiagram(page) {
  const probe = await page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing", xml: "" };
    try {
      const saved = await modeler.saveXML({ format: true });
      const xml = String(saved?.xml || "");
      return { ok: true, xml };
    } catch (error) {
      return { ok: false, error: String(error?.message || error), xml: "" };
    }
  });
  expect(probe.ok, JSON.stringify(probe)).toBeTruthy();
  return {
    xml: String(probe.xml || ""),
    hash: fnv1aHex(probe.xml || ""),
    len: String(probe.xml || "").length,
  };
}

async function saveAndWaitPut(page, putStatuses) {
  const responsePromise = page.waitForResponse((resp) => {
    return resp.request().method() === "PUT"
      && /\/api\/sessions\/[^/]+\/bpmn(?:\?|$)/.test(resp.url())
      && resp.status() === 200;
  });
  await page.locator("button.processSaveBtn").first().click();
  const resp = await responsePromise;
  putStatuses.push(resp.status());
}

async function mutateDiagram(page, marker) {
  const result = await page.evaluate((label) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const source = registry.get("Task_1_3") || registry.get("Task_1_2") || registry.get("Task_1_1");
      if (!source) return { ok: false, error: "source_missing" };
      modeling.updateLabel(source, `${label}_SOURCE`);
      const root = source.parent;
      const next = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(source.x || 0) + 220, y: Number(source.y || 0) + 50 },
        root,
      );
      modeling.updateLabel(next, label);
      modeling.connect(source, next, { type: "bpmn:SequenceFlow" });
      return { ok: true, sourceId: String(source.id || ""), nextId: String(next.id || "") };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, marker);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
}

async function mutateInterview(page, marker) {
  const quickInput = page.getByPlaceholder("Быстрый ввод шага: введите действие и нажмите Enter").first();
  if (await quickInput.isVisible().catch(() => false)) {
    await quickInput.fill(marker);
    await quickInput.press("Enter");
    return;
  }
  const firstInput = page.locator(".interviewStepRow td .input").first();
  await expect(firstInput).toBeVisible();
  await firstInput.fill(marker);
  await firstInput.press("Tab");
}

async function openVersionsModal(page) {
  const trigger = page.getByTestId("bpmn-versions-open");
  await expect(trigger).toBeVisible();
  await trigger.evaluate((node) => node.click());
  await expect(page.getByTestId("bpmn-versions-modal")).toBeVisible();
}

test("big tab transition matrix keeps diagram stable across tab chains, reload, and snapshot restore", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const seedXml = makeBigDiagramXml({
    seed: 20260221,
    pools: 2,
    lanes: 3,
    tasks: 8,
    edges: 14,
    annotations: 3,
  });
  const fixture = await createFixture(request, runId, seedXml);

  const putStatuses = [];
  const matrixCases = makeMatrixCases();

  await openFixture(page, fixture);
  await assertDiagramVisible(page, "diagram_initial");

  let currentTab = "Diagram";
  let transitionIndex = 0;
  let latestDiagramSnapshot = await readXmlFromDiagram(page);
  const diagramHashHistory = [latestDiagramSnapshot.hash];
  expect(latestDiagramSnapshot.len).toBeGreaterThan(4000);
  expect(hasDiMarkers(latestDiagramSnapshot.xml)).toBeTruthy();

  const diagramMutationTransitions = new Map([
    [2, `DGM_1_${runId.slice(-4)}`],
    [7, `DGM_2_${runId.slice(-4)}`],
    [12, `DGM_3_${runId.slice(-4)}`],
  ]);
  const interviewMutationTransitions = new Map([
    [5, `INT_1_${runId.slice(-4)}`],
    [11, `INT_2_${runId.slice(-4)}`],
  ]);
  const diagramMarkers = [];
  let pendingInterviewInvariant = null;
  let reloaded = false;

  for (const chain of matrixCases) {
    for (const target of chain.sequence) {
      if (target === currentTab) continue;
      transitionIndex += 1;
      await switchTab(page, target);
      currentTab = target;

      if (target === "Diagram") {
        await assertDiagramVisible(page, `${chain.id}:t${transitionIndex}:diagram`);
      }

      if (target === "XML") {
        const xmlSnap = await readXmlFromEditor(page);
        expect(xmlSnap.len).toBeGreaterThan(0);
        expect(hasDiMarkers(xmlSnap.xml)).toBeTruthy();
        if (pendingInterviewInvariant) {
          const rolledBack = pendingInterviewInvariant.olderHashes.has(xmlSnap.hash);
          expect(rolledBack, `interview rollback at t${transitionIndex}`).toBeFalsy();
          pendingInterviewInvariant = null;
        }
      }

      if (interviewMutationTransitions.has(transitionIndex) && target === "Interview") {
        await mutateInterview(page, interviewMutationTransitions.get(transitionIndex));
        pendingInterviewInvariant = {
          olderHashes: new Set(diagramHashHistory.slice(0, -1)),
        };
      }

      if (diagramMutationTransitions.has(transitionIndex) && target === "Diagram") {
        const marker = diagramMutationTransitions.get(transitionIndex);
        diagramMarkers.push(marker);
        await mutateDiagram(page, marker);
        await saveAndWaitPut(page, putStatuses);
        const nextSnapshot = await readXmlFromDiagram(page);
        expect(nextSnapshot.xml).toContain(marker);
        expect(nextSnapshot.hash).not.toBe(latestDiagramSnapshot.hash);
        latestDiagramSnapshot = nextSnapshot;
        diagramHashHistory.push(nextSnapshot.hash);
      } else if (target === "Diagram" && pendingInterviewInvariant) {
        const snap = await readXmlFromDiagram(page);
        const rolledBack = pendingInterviewInvariant.olderHashes.has(snap.hash);
        expect(rolledBack, `interview rollback at t${transitionIndex}`).toBeFalsy();
        pendingInterviewInvariant = null;
      }

      if (!reloaded && transitionIndex === 9) {
        const beforeReload = await readXmlFromDiagram(page);
        const latestMarker = diagramMarkers[diagramMarkers.length - 1] || "";
        await page.reload({ waitUntil: "domcontentloaded" });
        await openFixture(page, fixture, { skipGoto: true, skipInit: true });
        currentTab = "Diagram";
        await assertDiagramVisible(page, "diagram_after_reload");
        const afterReload = await readXmlFromDiagram(page);
        expect(hasDiMarkers(afterReload.xml)).toBeTruthy();
        expect(afterReload.len).toBeGreaterThanOrEqual(Math.floor(beforeReload.len * 0.85));
        if (latestMarker) {
          expect(afterReload.xml).toContain(latestMarker);
        }
        reloaded = true;
      }
    }
  }

  expect(transitionIndex).toBeGreaterThanOrEqual(10);
  expect(transitionIndex).toBeLessThanOrEqual(15);
  expect(diagramMarkers.length).toBe(3);
  expect(putStatuses.length).toBeGreaterThanOrEqual(3);
  expect(putStatuses.every((code) => code === 200)).toBeTruthy();

  await openVersionsModal(page);
  const cards = page.getByTestId("bpmn-version-item");
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThanOrEqual(2);

  let restored = false;
  const midMarker = diagramMarkers[1];
  const lastMarker = diagramMarkers[2];
  for (let i = 0; i < cardCount; i += 1) {
    const card = cards.nth(i);
    await card.getByTestId("bpmn-version-preview").click();
    const previewXml = await page.getByTestId("bpmn-version-preview-xml").inputValue();
    if (!previewXml.includes(midMarker) || previewXml.includes(lastMarker)) continue;
    await card.getByTestId("bpmn-version-restore").click();
    restored = true;
    break;
  }
  expect(restored).toBeTruthy();
  await expect(page.getByText(/Версия восстановлена/i)).toBeVisible();
  await page.getByRole("button", { name: "Закрыть" }).click();

  const afterRestore = await readXmlFromEditor(page);
  expect(afterRestore.xml).toContain(midMarker);
  expect(afterRestore.xml).not.toContain(lastMarker);
  expect(hasDiMarkers(afterRestore.xml)).toBeTruthy();

  await switchTab(page, "Diagram");
  await assertDiagramVisible(page, "diagram_after_restore");
});
