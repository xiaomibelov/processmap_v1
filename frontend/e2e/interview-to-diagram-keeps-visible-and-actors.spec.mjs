import { expect, test } from "@playwright/test";

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

async function createFixture(request, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    data: { title: `E2E interview-diagram actors project ${runId}`, passport: {} },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project.id || project.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`,
    {
      data: {
        title: `E2E interview-diagram actors session ${runId}`,
        roles: [],
        start_role: "",
      },
    },
  );
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session.id || session.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId };
}

async function switchTab(page, title) {
  const btn = page.locator(".segBtn").filter({ hasText: new RegExp(`^${title}$`, "i") }).first();
  await expect(btn).toBeVisible();
  await btn.click();
}

async function openFixture(page, fixture) {
  await page.goto("/");
  await expect(page.locator(".topbar .topSelect--project")).toBeVisible();
  await page.selectOption(".topbar .topSelect--project", fixture.projectId);
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.locator(`.topbar .topSelect--session option[value="${fixture.sessionId}"]`)).toHaveCount(1);
  await page.selectOption(".topbar .topSelect--session", fixture.sessionId);
  await switchTab(page, "Diagram");
}

async function createParticipantWithTwoLanes(page, laneA, laneB) {
  return await page.evaluate(
    ({ a, b }) => {
      const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
      if (!modeler) return { ok: false, error: "modeler_missing" };
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const canvas = modeler.get("canvas");
      const elementRegistry = modeler.get("elementRegistry");
      const root = canvas.getRootElement();
      try {
        const participant = modeling.createShape(
          elementFactory.createParticipantShape({ type: "bpmn:Participant", isExpanded: true }),
          { x: 420, y: 260 },
          root,
        );
        modeling.splitLane(participant, 2);
        const lanes = elementRegistry.filter?.((el) => el.type === "bpmn:Lane") || [];
        if (lanes[0]) modeling.updateLabel(lanes[0], a);
        if (lanes[1]) modeling.updateLabel(lanes[1], b);
        return { ok: true, laneIds: lanes.map((lane) => lane.id) };
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
    },
    { a: laneA, b: laneB },
  );
}

async function readDiagramProbe(page) {
  return await page.evaluate(() => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) {
      return {
        hasModeler: false,
        registryCount: -1,
        hostRect: "0x0",
        svgRect: "0x0",
      };
    }
    try {
      const registry = modeler.get("elementRegistry");
      const canvas = modeler.get("canvas");
      const container = canvas?._container;
      const svg = container?.querySelector?.("svg");
      const host = container?.closest?.(".bpmnStageHost");
      const hostRect = host?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const svgRect = svg?.getBoundingClientRect?.() || { width: 0, height: 0 };
      return {
        hasModeler: true,
        registryCount: Array.isArray(registry?.getAll?.()) ? registry.getAll().length : 0,
        hostRect: `${Math.round(Number(hostRect.width || 0))}x${Math.round(Number(hostRect.height || 0))}`,
        svgRect: `${Math.round(Number(svgRect.width || 0))}x${Math.round(Number(svgRect.height || 0))}`,
      };
    } catch (error) {
      return {
        hasModeler: true,
        registryCount: -2,
        hostRect: "0x0",
        svgRect: "0x0",
        error: String(error?.message || error),
      };
    }
  });
}

function probeReady(probe) {
  const svgDims = String(probe?.svgRect || "").match(/^(\d+)x(\d+)$/);
  const hostDims = String(probe?.hostRect || "").match(/^(\d+)x(\d+)$/);
  const svgW = Number(svgDims?.[1] || 0);
  const svgH = Number(svgDims?.[2] || 0);
  const hostW = Number(hostDims?.[1] || 0);
  const hostH = Number(hostDims?.[2] || 0);
  return Number(probe?.registryCount || 0) > 0 && hostW > 20 && hostH > 20 && svgW > 0 && svgH > 0;
}

async function waitForModelerReady(page) {
  await expect
    .poll(async () => probeReady(await readDiagramProbe(page)))
    .toBeTruthy();
}

test("Interview->Diagram сохраняет видимость диаграммы и actors_derived", async ({ page, request }) => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fixture = await createFixture(request, runId);
  const laneA = `Повар A ${runId.slice(-4)}`;
  const laneB = `Повар B ${runId.slice(-4)}`;

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.localStorage.setItem("fpc_debug_bpmn", "1");
  });

  await openFixture(page, fixture);
  await waitForModelerReady(page);
  const createResult = await createParticipantWithTwoLanes(page, laneA, laneB);
  expect(createResult.ok, JSON.stringify(createResult)).toBeTruthy();

  await expect
    .poll(async () => await page.locator(".actorsCard .roleRowItem").allInnerTexts())
    .toEqual([`1. ${laneA}`, `2. ${laneB}`]);

  for (let i = 0; i < 3; i += 1) {
    await switchTab(page, "Interview");
    await page.waitForTimeout(i % 2 === 0 ? 40 : 90);
    await switchTab(page, "Diagram");

    let probe = await readDiagramProbe(page);
    await expect
      .poll(async () => {
        probe = await readDiagramProbe(page);
        return probeReady(probe);
      }, `cycle=${i + 1} probe=${JSON.stringify(probe)}`)
      .toBeTruthy();

    await expect
      .poll(async () => await page.locator(".actorsCard .roleRowItem").allInnerTexts())
      .toEqual([`1. ${laneA}`, `2. ${laneB}`]);
  }
});
