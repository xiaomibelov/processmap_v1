import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { API_BASE, apiJson, createFixture, seedXml, switchTab } from "./helpers/processFixture.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

async function patchDrawioMeta(request, headers, sessionId) {
  const payload = {
    bpmn_meta: {
      drawio: {
        enabled: true,
        locked: false,
        opacity: 1,
        svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 240 120\"><rect id=\"shape1\" x=\"60\" y=\"30\" width=\"120\" height=\"60\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/></svg>",
        transform: { x: 260, y: 130 },
        drawio_layers_v1: [{ id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 }],
        drawio_elements_v1: [
          { id: "shape1", layer_id: "DL1", visible: true, locked: false, deleted: false, opacity: 1, offset_x: 0, offset_y: 0, z_index: 1 },
        ],
      },
    },
  };
  const res = await request.patch(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers,
    data: payload,
  });
  await apiJson(res, "patch drawio meta");
}

async function openLayersPopover(page) {
  const layersBtn = page.getByTestId("diagram-action-layers");
  await expect(layersBtn).toBeVisible();
  await layersBtn.click({ force: true });
  const popover = page.getByTestId("diagram-action-layers-popover");
  await expect(popover).toBeVisible();
  return popover;
}

async function ensureDrawioEditMode(page, popover) {
  const modeEdit = popover.getByTestId("diagram-action-layers-mode-edit");
  const drawioToggle = popover.getByTestId("diagram-action-layers-drawio-toggle");
  if (await modeEdit.isDisabled()) {
    await drawioToggle.check({ force: true });
    await expect(modeEdit).toBeEnabled();
  }
  await modeEdit.click({ force: true });
  await expect
    .poll(async () => {
      const style = String(await page.getByTestId("drawio-el-shape1").getAttribute("style") || "");
      return style.includes("cursor:move") && style.includes("pointer-events:auto");
    }, { timeout: 10000 })
    .toBeTruthy();
}

function isSessionWriteRequest(requestUrlRaw, methodRaw, sessionIdRaw) {
  const url = String(requestUrlRaw || "");
  const method = String(methodRaw || "").toUpperCase();
  const sessionId = String(sessionIdRaw || "");
  if (!sessionId || (method !== "PATCH" && method !== "PUT")) return false;
  return (
    url.includes(`/api/sessions/${encodeURIComponent(sessionId)}`)
    || url.includes(`/api/sessions/${sessionId}`)
  );
}

test("drawio runtime perf evidence: drag hot path counters in product runtime", async ({ page, request }) => {
  test.skip(process.env.E2E_DRAWIO_PERF !== "1", "Set E2E_DRAWIO_PERF=1 to run drawio perf evidence test.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_perf`,
    auth.headers,
    seedXml({ processName: `Drawio perf ${runId}`, taskName: "Drawio perf task" }),
  );
  await patchDrawioMeta(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
    window.__FPC_DRAWIO_PERF_ENABLE__ = true;
    window.__FPC_DRAWIO_PERF__ = {
      counters: {},
      samples: {},
      marks: {},
      startedAt: Date.now(),
      resetAt: Date.now(),
    };
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  const drawioRect = page.getByTestId("drawio-el-shape1");
  await expect(drawioRect).toBeVisible();

  const popover = await openLayersPopover(page);
  await ensureDrawioEditMode(page, popover);
  await page.getByTestId("diagram-action-layers").click({ force: true });

  await page.evaluate(() => {
    window.__FPC_DRAWIO_PERF__ = {
      counters: {},
      samples: {},
      marks: {},
      startedAt: Date.now(),
      resetAt: Date.now(),
    };
  });

  let dragActive = false;
  const requestLog = [];
  page.on("request", (req) => {
    if (!isSessionWriteRequest(req.url(), req.method(), fixture.sessionId)) return;
    requestLog.push({
      ts: Date.now(),
      method: req.method(),
      url: req.url(),
      duringDrag: dragActive,
    });
  });

  const box = await drawioRect.boundingBox();
  expect(box).toBeTruthy();
  const startX = Number(box.x || 0) + Number(box.width || 0) / 2;
  const startY = Number(box.y || 0) + Number(box.height || 0) / 2;

  dragActive = true;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 24; i += 1) {
    await page.mouse.move(startX + (i * 4), startY + ((i % 2 === 0) ? 2 : 5), { steps: 1 });
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  dragActive = false;

  await page.waitForTimeout(900);

  const perf = await page.evaluate(() => window.__FPC_DRAWIO_PERF__ || null);
  expect(perf).toBeTruthy();
  const counters = perf?.counters || {};
  const samples = perf?.samples || {};

  const moveEvents = Number(counters["drawio.drag.move.events"] || 0);
  const rafTicks = Number(counters["drawio.drag.move.rafTicks"] || 0);
  const draftSetCalls = Number(counters["drawio.drag.state.setDraftOffset"] || 0);
  const draftRefUpdates = Number(counters["drawio.drag.draftRef.updates"] || 0);
  const previewApplies = Number(counters["drawio.drag.previewTransform.applies"] || 0);
  const rendererRenders = Number(counters["drawio.renderer.renders"] || 0);
  const rendererRecompute = Number(counters["drawio.renderer.renderedBody.recompute"] || 0);
  const panelBuilds = Number(counters["drawio.panel.model.builds"] || 0);
  const commitCalls = Number(counters["drawio.drag.commit.calls"] || 0);
  const writesDuringDrag = requestLog.filter((entry) => entry.duringDrag).length;

  expect(moveEvents).toBeGreaterThan(8);
  expect(rafTicks).toBeGreaterThan(4);
  expect(draftSetCalls).toBeLessThanOrEqual(4);
  expect(commitCalls).toBe(1);
  expect(rendererRecompute).toBeLessThan(10);
  expect(writesDuringDrag).toBe(0);

  // eslint-disable-next-line no-console
  console.info("[drawio-runtime-perf-evidence]", JSON.stringify({
    sessionId: fixture.sessionId,
    counters: {
      moveEvents,
      rafTicks,
      draftSetCalls,
      draftRefUpdates,
      previewApplies,
      rendererRenders,
      rendererRecompute,
      panelBuilds,
      commitCalls,
    },
    samples: {
      rafLatencyMs: samples["drawio.drag.rafLatencyMs"] || null,
      rafWorkMs: samples["drawio.drag.rafWorkMs"] || null,
    },
    requests: {
      totalSessionWrites: requestLog.length,
      writesDuringDrag,
    },
  }));
});

