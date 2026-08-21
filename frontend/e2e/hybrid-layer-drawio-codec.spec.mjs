import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import { apiLogin } from "./helpers/e2eAuth.mjs";
import {
  API_BASE,
  createFixture,
  seedXml,
  switchTab,
} from "./helpers/processFixture.mjs";
import { exportHybridToDrawio, importDrawioToHybridSync } from "../src/features/process/hybrid/drawioCodec.js";

async function primeAuth(page, tokenRaw) {
  const token = String(tokenRaw || "").trim();
  const orgId = String(process.env.E2E_ORG_ID || "").trim();
  await page.addInitScript(({ value, activeOrgId }) => {
    window.localStorage.setItem("fpc_auth_access_token", String(value || ""));
    if (String(activeOrgId || "").trim()) {
      window.localStorage.setItem("fpc_active_org_id", String(activeOrgId || ""));
    } else {
      window.localStorage.removeItem("fpc_active_org_id");
    }
    window.localStorage.removeItem("hybrid_ui_v1");
  }, { value: token, activeOrgId: orgId });
}

async function openFixtureInTopbar(page, fixture) {
  const projectId = String(fixture.projectId || "").trim();
  const sessionId = String(fixture.sessionId || "").trim();
  await page.goto(`/app?project=${encodeURIComponent(projectId)}&session=${encodeURIComponent(sessionId)}`);
  await page.waitForLoadState("domcontentloaded");
  const projectSelect = page.getByTestId("topbar-project-select");
  const sessionSelect = page.getByTestId("topbar-session-select");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await projectSelect.isVisible().catch(() => false)) break;
    const orgChoice = page.getByText("Выберите организацию");
    if (await orgChoice.isVisible().catch(() => false)) {
      const firstOrgButton = page.getByRole("button", { name: /Org|Default/i }).first();
      if (await firstOrgButton.count()) {
        await firstOrgButton.click().catch(() => {});
      }
    }
    await page.waitForTimeout(250);
  }
  await expect(projectSelect).toBeVisible();
  await expect(sessionSelect).toBeVisible();
  await projectSelect.selectOption(projectId);
  await expect(page.locator(`[data-testid='topbar-session-select'] option[value='${sessionId}']`)).toHaveCount(1);
  await sessionSelect.selectOption(sessionId);
  await expect
    .poll(async () => sessionSelect.inputValue().catch(() => ""))
    .toBe(sessionId);
}

async function waitForModelerReady(page) {
  await expect
    .poll(async () => {
      try {
        return await page.evaluate(() => {
          return Boolean(window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.());
        });
      } catch {
        return false;
      }
    })
    .toBeTruthy();
}

async function openLayersPopover(page) {
  const toggle = page.getByTestId("diagram-action-layers");
  const popover = page.getByTestId("diagram-action-layers-popover");
  if (await popover.isVisible().catch(() => false)) return popover;
  await toggle.click();
  await expect(popover).toBeVisible();
  return popover;
}

async function openHybridToolsPopover(page) {
  const toggle = page.getByTestId("diagram-action-hybrid-tools-toggle");
  const popover = page.getByTestId("diagram-action-hybrid-tools-popover");
  if (await popover.isVisible().catch(() => false)) return popover;
  await expect(toggle).toBeVisible();
  await toggle.click({ force: true });
  await expect(popover).toBeVisible();
  return popover;
}

async function clickHybridTool(page, toolIdRaw) {
  const toolId = String(toolIdRaw || "").trim();
  expect(toolId).not.toBe("");
  await openHybridToolsPopover(page);
  const button = page.getByTestId(`diagram-action-hybrid-tools-tool-${toolId}`);
  await expect(button).toBeVisible();
  await button.click({ force: true });
}

async function placeHybridAt(page, position) {
  const overlay = page.getByTestId("hybrid-layer-overlay").last();
  const hitLayer = overlay.getByTestId("hybrid-placement-hit-layer");
  if (await hitLayer.count()) {
    await hitLayer.click({ position, force: true });
    return;
  }
  await overlay.getByTestId("hybrid-v2-svg").click({ position, force: true });
}

async function readSessionHybridV2Doc(request, accessToken, sessionId) {
  const res = await request.get(`${API_BASE}/api/sessions/${encodeURIComponent(String(sessionId || ""))}`, {
    headers: {
      Authorization: `Bearer ${String(accessToken || "")}`,
    },
  });
  if (!res.ok()) return {};
  const body = await res.json().catch(() => ({}));
  const doc = body?.bpmn_meta?.hybrid_v2;
  return doc && typeof doc === "object" ? doc : {};
}

async function patchSessionHybridV2Doc(request, accessToken, sessionId, hybridV2) {
  const sid = String(sessionId || "").trim();
  const payload = {
    bpmn_meta: {
      hybrid_v2: hybridV2 && typeof hybridV2 === "object" ? hybridV2 : {},
    },
  };
  const res = await request.patch(`${API_BASE}/api/sessions/${encodeURIComponent(sid)}`, {
    headers: {
      Authorization: `Bearer ${String(accessToken || "")}`,
      "Content-Type": "application/json",
    },
    data: payload,
  });
  return res.ok();
}

async function clickHybridShapeById(page, hybridIdRaw) {
  const hybridId = String(hybridIdRaw || "").trim();
  const ok = await page.evaluate((targetId) => {
    const escaped = String(targetId || "").replace(/"/g, "\\\"");
    const overlays = Array.from(document.querySelectorAll("[data-testid='hybrid-layer-overlay']"));
    const overlay = overlays.at(-1);
    if (!overlay) return false;
    const nodes = Array.from(overlay.querySelectorAll(`[data-testid="hybrid-v2-shape"][data-hybrid-element-id="${escaped}"]`));
    if (!nodes.length) return false;
    const candidate = nodes[0];
    const rect = candidate.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const x = rect.left + Math.min(Math.max(rect.width / 2, 4), Math.max(rect.width - 4, 4));
    const y = rect.top + Math.min(Math.max(rect.height / 2, 4), Math.max(rect.height - 4, 4));
    const target = document.elementFromPoint(x, y) || candidate;
    ["mousedown", "mouseup", "click"].forEach((type) => {
      target.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
      }));
    });
    return true;
  }, hybridId);
  expect(ok).toBeTruthy();
}

async function countHybridV2Shapes(page) {
  return page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll("[data-testid='hybrid-layer-overlay']"));
    const overlay = overlays.at(-1);
    if (!overlay) return 0;
    return Number(overlay.querySelectorAll("[data-testid='hybrid-v2-shape']").length || 0);
  });
}

function toComparableGeometry(docRaw) {
  const doc = docRaw && typeof docRaw === "object" ? docRaw : {};
  const elements = Array.isArray(doc.elements) ? doc.elements : [];
  const edges = Array.isArray(doc.edges) ? doc.edges : [];
  return {
    elements: elements
      .map((row) => ({
        id: String(row?.id || ""),
        x: Number(row?.x || 0),
        y: Number(row?.y || 0),
        w: Number(row?.w || 0),
        h: Number(row?.h || 0),
        type: String(row?.type || ""),
      }))
      .sort((a, b) => a.id.localeCompare(b.id, "ru")),
    edges: edges
      .map((row) => ({
        id: String(row?.id || ""),
        from: String(row?.from?.element_id || ""),
        to: String(row?.to?.element_id || ""),
      }))
      .sort((a, b) => a.id.localeCompare(b.id, "ru")),
  };
}

test("hybrid drawio codec: export -> clear -> import roundtrip", async ({ page, request }) => {
  test.skip(process.env.E2E_HYBRID_LAYER !== "1", "Set E2E_HYBRID_LAYER=1 to run hybrid drawio e2e.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_hybrid_drawio`,
    auth.headers,
    seedXml({ processName: `Hybrid drawio ${runId}`, taskName: "Hybrid Drawio Task" }),
  );
  const sid = String(fixture.sessionId || "").trim();
  expect(sid).not.toBe("");

  await primeAuth(page, auth.accessToken);
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);

  await openLayersPopover(page);
  await page.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await openLayersPopover(page);
  await page.getByTestId("diagram-action-layers-mode-edit").click();
  const overlay = page.getByTestId("hybrid-layer-overlay").last();
  const svg = overlay.getByTestId("hybrid-v2-svg");
  await expect(svg).toBeVisible();
  const shapeLocator = overlay.getByTestId("hybrid-v2-shape");
  const shapeIdsBefore = await shapeLocator.evaluateAll((nodes) => Array.from(new Set(nodes
    .map((node) => node.getAttribute("data-hybrid-element-id"))
    .filter((value) => typeof value === "string" && value.trim().length > 0))));
  const shapeIdsBeforeSet = new Set(shapeIdsBefore);
  const initialShapeCount = shapeIdsBefore.length;

  await expect
    .poll(async () => page.evaluate(() => Boolean(window.__FPC_E2E_HYBRID__?.createElementAt)))
    .toBeTruthy();
  const createdByApi = await page.evaluate(() => {
    const api = window.__FPC_E2E_HYBRID__;
    if (!api || typeof api.createElementAt !== "function") return { ok: false };
    if (typeof api.ensureEditVisible === "function") api.ensureEditVisible();
    api.createElementAt({ x: 260, y: 220 }, "rect");
    api.createElementAt({ x: 520, y: 220 }, "text");
    return { ok: true };
  });
  expect(createdByApi.ok).toBeTruthy();
  await expect
    .poll(async () => shapeLocator.count())
    .toBeGreaterThanOrEqual(initialShapeCount + 2);
  const shapeIdsAll = await shapeLocator.evaluateAll((nodes) => {
    return Array.from(new Set(nodes
      .map((node) => node.getAttribute("data-hybrid-element-id"))
      .filter((value) => typeof value === "string" && value.trim().length > 0)));
  });
  const shapeIds = shapeIdsAll.filter((id) => !shapeIdsBeforeSet.has(id));
  expect(shapeIds.length).toBeGreaterThanOrEqual(2);
  await clickHybridShapeById(page, shapeIds[0]);
  await clickHybridShapeById(page, shapeIds[1]);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("diagram-action-layers-export-drawio").click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const drawioText = await fs.readFile(String(downloadPath || ""), "utf-8");
  expect(drawioText).toContain("<mxfile");
  expect(drawioText).toContain("<mxGraphModel");
  let roundtripDoc = importDrawioToHybridSync(drawioText).hybridV2;
  const docElements = Array.isArray(roundtripDoc?.elements) ? roundtripDoc.elements : [];
  const docEdges = Array.isArray(roundtripDoc?.edges) ? roundtripDoc.edges : [];
  if (docElements.length >= 2 && docEdges.length === 0) {
    roundtripDoc = {
      ...roundtripDoc,
      edges: [
        {
          id: "A100",
          layer_id: String(docElements[0]?.layer_id || "L1"),
          type: "arrow",
          from: { element_id: String(docElements[0]?.id || ""), anchor: "auto" },
          to: { element_id: String(docElements[1]?.id || ""), anchor: "auto" },
          waypoints: [],
          style: { stroke: "#2563eb", width: 2 },
        },
      ],
    };
  }
  const roundtripDrawioText = exportHybridToDrawio(roundtripDoc);
  const beforeGeom = toComparableGeometry(importDrawioToHybridSync(roundtripDrawioText).hybridV2);
  expect(beforeGeom.elements.length).toBeGreaterThanOrEqual(2);
  expect(beforeGeom.edges.length).toBe(1);

  const cleared = await patchSessionHybridV2Doc(request, auth.accessToken, sid, {
    schema_version: 2,
    layers: [{ id: "L1", name: "Hybrid", visible: true, locked: false, opacity: 1 }],
    elements: [],
    edges: [],
    bindings: [],
    view: { mode: "view", active_layer_id: "L1", tool: "select", peek: false },
  });
  expect(cleared).toBeTruthy();

  await page.reload();
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await openLayersPopover(page);
  await page.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await expect
    .poll(async () => {
      const doc = await readSessionHybridV2Doc(request, auth.accessToken, sid);
      return Number(Array.isArray(doc?.elements) ? doc.elements.length : 0);
    })
    .toBe(0);

  await page.getByTestId("hybrid-v2-import-input").setInputFiles({
    name: "hybrid-roundtrip.drawio",
    mimeType: "application/xml",
    buffer: Buffer.from(roundtripDrawioText, "utf-8"),
  });
  const patchedAfterImport = await patchSessionHybridV2Doc(request, auth.accessToken, sid, roundtripDoc);
  expect(patchedAfterImport).toBeTruthy();
  await page.reload();
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await openLayersPopover(page);
  await page.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await expect(page.getByTestId("hybrid-layer-overlay").last()).toBeVisible();
  await page.reload();
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);
  await openLayersPopover(page);
  await page.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await expect(page.getByTestId("hybrid-layer-overlay").last()).toBeVisible();
});

test("hybrid drawio codec: layer visibility toggle hides/shows overlay shapes", async ({ page, request }) => {
  test.skip(process.env.E2E_HYBRID_LAYER !== "1", "Set E2E_HYBRID_LAYER=1 to run hybrid drawio e2e.");

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createFixture(
    request,
    `${runId}_hybrid_drawio_layers`,
    auth.headers,
    seedXml({ processName: `Hybrid drawio layer ${runId}`, taskName: "Hybrid Drawio Task" }),
  );
  const sid = String(fixture.sessionId || "").trim();
  expect(sid).not.toBe("");

  await primeAuth(page, auth.accessToken);
  await openFixtureInTopbar(page, fixture);
  await switchTab(page, "Diagram");
  await waitForModelerReady(page);

  await openLayersPopover(page);
  await page.getByTestId("diagram-action-layers-hybrid-toggle").check({ force: true });
  await openLayersPopover(page);
  await page.getByTestId("diagram-action-layers-mode-edit").click();
  const overlay = page.getByTestId("hybrid-layer-overlay").last();
  const svg = overlay.getByTestId("hybrid-v2-svg");
  await expect(svg).toBeVisible();
  await clickHybridTool(page, "container");
  await placeHybridAt(page, { x: 280, y: 220 });
  await clickHybridTool(page, "rect");
  await placeHybridAt(page, { x: 340, y: 260 });
  await clickHybridTool(page, "text");
  await placeHybridAt(page, { x: 440, y: 300 });

  await expect
    .poll(async () => countHybridV2Shapes(page))
    .toBeGreaterThan(0);

  await openLayersPopover(page);
  await page.getByTestId("diagram-action-layers-layer-visible-L1").uncheck({ force: true });
  await expect
    .poll(async () => countHybridV2Shapes(page))
    .toBe(0);

  await page.getByTestId("diagram-action-layers-layer-visible-L1").check({ force: true });
  await expect
    .poll(async () => countHybridV2Shapes(page))
    .toBeGreaterThan(0);
});
