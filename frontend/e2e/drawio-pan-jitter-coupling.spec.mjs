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
        svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 260 140\"><rect id=\"shape1\" x=\"70\" y=\"35\" width=\"120\" height=\"60\" rx=\"8\" fill=\"rgba(59,130,246,0.25)\" stroke=\"#2563eb\" stroke-width=\"3\"/></svg>",
        transform: { x: 220, y: 120 },
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
  await apiJson(res, "patch drawio pan-jitter meta");
}

test("drawio pan coupling: no temporary drift while canvas pan updates", async ({ page, request }) => {
  test.skip(process.env.E2E_DRAWIO_PAN_JITTER !== "1", "Set E2E_DRAWIO_PAN_JITTER=1 to run pan jitter coupling check.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_drawio_pan_jitter`,
    auth.headers,
    seedXml({ processName: `Drawio pan jitter ${runId}`, taskName: "Drawio pan task" }),
  );
  await patchDrawioMeta(request, auth.headers, fixture.sessionId);

  await page.addInitScript(() => {
    window.__FPC_E2E__ = true;
  });
  await setUiToken(page, auth.accessToken, { activeOrgId: fixture.orgId || auth.activeOrgId });
  await openSessionInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForDiagramReady(page);

  await expect(page.getByTestId("drawio-el-shape1")).toBeVisible();

  const stats = await page.evaluate(async () => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    const canvas = modeler?.get?.("canvas");
    const host = document.querySelector(".bpmnStageHost");
    const drawioViewport = document.querySelector("[data-testid='drawio-overlay-svg'] > g");
    if (!canvas || !(host instanceof Element) || !(drawioViewport instanceof Element)) {
      return { ok: false, error: "canvas_or_overlay_unavailable" };
    }
    const hostRect = host.getBoundingClientRect();
    const width = Number(hostRect.width || 0);
    const height = Number(hostRect.height || 0);
    if (!(width > 0) || !(height > 0)) {
      return { ok: false, error: "host_rect_unavailable" };
    }
    const parseMatrix = (textRaw) => {
      const text = String(textRaw || "");
      const match = text.match(/matrix\(([^)]+)\)/i);
      if (!match) return null;
      const parts = String(match[1] || "").split(",").map((x) => Number(String(x || "").trim()));
      if (parts.length !== 6 || parts.some((x) => !Number.isFinite(x))) return null;
      return { a: parts[0], b: parts[1], c: parts[2], d: parts[3], e: parts[4], f: parts[5] };
    };
    const expectedMatrixFromViewbox = () => {
      const vb = canvas.viewbox();
      const vbWidth = Number(vb?.width || 0);
      const vbHeight = Number(vb?.height || 0);
      const vbX = Number(vb?.x || 0);
      const vbY = Number(vb?.y || 0);
      let scale = 1;
      if (vbWidth > 0 && width > 0) scale = width / vbWidth;
      else if (vbHeight > 0 && height > 0) scale = height / vbHeight;
      const drawioMeta = window.__FPC_E2E_DRAWIO__?.readMeta?.() || {};
      const tx = Number(drawioMeta?.transform?.x || 0);
      const ty = Number(drawioMeta?.transform?.y || 0);
      return {
        a: scale,
        b: 0,
        c: 0,
        d: scale,
        e: (-vbX * scale) + (scale * tx),
        f: (-vbY * scale) + (scale * ty),
      };
    };
    const readMismatch = () => {
      const actual = parseMatrix(drawioViewport.getAttribute("transform"));
      const expected = expectedMatrixFromViewbox();
      if (!actual) {
        return {
          missing: true,
          mismatch: Number.POSITIVE_INFINITY,
          actual: null,
          expected,
        };
      }
      const deltaE = Math.abs(Number(actual.e || 0) - Number(expected.e || 0));
      const deltaF = Math.abs(Number(actual.f || 0) - Number(expected.f || 0));
      return {
        missing: false,
        mismatch: Math.hypot(deltaE, deltaF),
        deltaE,
        deltaF,
        actual,
        expected,
      };
    };
    const raf = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const baseline = readMismatch();
    let max = { mismatch: Number(baseline?.mismatch || 0), sample: baseline, zoom: 1 };
    const samples = [];
    const byZoom = [];

    const applyPanStep = async (dx, dy) => {
      if (typeof canvas.scroll === "function") {
        canvas.scroll({ dx, dy });
      } else {
        const vb = canvas.viewbox();
        canvas.viewbox({
          ...vb,
          x: Number(vb?.x || 0) + dx,
          y: Number(vb?.y || 0) + dy,
        });
      }
      await raf();
      const current = readMismatch();
      samples.push({
        dx,
        dy,
        mismatch: current.mismatch,
        deltaE: current.deltaE,
        deltaF: current.deltaF,
      });
      if (current.mismatch > max.mismatch) {
        max = { mismatch: current.mismatch, sample: current };
      }
    };

    const runPanCycle = async (zoomRaw) => {
      const targetZoom = Number(zoomRaw || 1);
      if (typeof canvas.zoom === "function" && Number.isFinite(targetZoom)) {
        canvas.zoom(targetZoom);
      }
      await raf();
      const zoomStart = samples.length;
      let zoomMax = 0;
      for (let i = 0; i < 14; i += 1) {
        await applyPanStep(14, 8);
      }
      for (let i = 0; i < 14; i += 1) {
        await applyPanStep(-14, -8);
      }
      for (let i = zoomStart; i < samples.length; i += 1) {
        zoomMax = Math.max(zoomMax, Number(samples[i]?.mismatch || 0));
      }
      byZoom.push({ zoom: targetZoom, maxMismatch: zoomMax });
    };

    await runPanCycle(1);
    await runPanCycle(1.25);
    await runPanCycle(1.6);
    await raf();
    const settled = readMismatch();

    return {
      ok: true,
      baseline,
      settled,
      maxMismatch: max.mismatch,
      maxSample: max.sample,
      byZoom,
      samples: samples.length,
      viewbox: canvas.viewbox?.() || null,
    };
  });

  // eslint-disable-next-line no-console
  console.info("[drawio-pan-jitter-coupling]", JSON.stringify(stats));

  expect(stats?.ok).toBeTruthy();
  expect(Number(stats?.samples || 0)).toBeGreaterThanOrEqual(40);
  expect(Array.isArray(stats?.byZoom)).toBeTruthy();
  expect(Number(stats?.byZoom?.length || 0)).toBeGreaterThanOrEqual(3);
  expect(Number(stats?.maxMismatch || 0)).toBeLessThan(2.5);
  expect(Number(stats?.settled?.mismatch || 0)).toBeLessThan(1.6);
});
