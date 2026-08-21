import { expect, test } from "@playwright/test";
import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { openSessionInTopbar, waitForDiagramReady } from "./helpers/diagramReady.mjs";

const API_BASE = process.env.E2E_API_BASE_URL || "http://127.0.0.1:8011";

function parseJsonSafe(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function apiJson(res, label) {
  const text = await res.text();
  const body = parseJsonSafe(text);
  expect(res.ok(), `${label}: status=${res.status()} body=${text}`).toBeTruthy();
  return body;
}

async function createProjectAndSession(request, authHeaders, runId) {
  const projectRes = await request.post(`${API_BASE}/api/projects`, {
    headers: authHeaders,
    data: {
      title: `E2E Playback Gateways ${runId}`,
      passport: {},
    },
  });
  const project = await apiJson(projectRes, "create project");
  const projectId = String(project?.id || project?.project_id || "").trim();
  expect(projectId).not.toBe("");

  const sessionRes = await request.post(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/sessions?mode=quick_skeleton`, {
    headers: authHeaders,
    data: {
      title: `E2E Playback Session ${runId}`,
      roles: ["Lane 1", "Lane 2"],
      start_role: "Lane 1",
    },
  });
  const session = await apiJson(sessionRes, "create session");
  const sessionId = String(session?.id || session?.session_id || "").trim();
  expect(sessionId).not.toBe("");
  return { projectId, sessionId };
}

async function injectGatewayBranch(page, marker) {
  const result = await page.evaluate((namePrefix) => {
    const modeler = window.__FPC_E2E_MODELER__ || window.__FPC_E2E_RUNTIME__?.getInstance?.();
    if (!modeler) return { ok: false, error: "modeler_missing" };
    try {
      const registry = modeler.get("elementRegistry");
      const modeling = modeler.get("modeling");
      const elementFactory = modeler.get("elementFactory");
      const start = (registry.getAll() || []).find((el) => /startevent$/i.test(String(el?.type || "")));
      const anchor = start || (registry.getAll() || []).find((el) => /task$/i.test(String(el?.type || "")));
      if (!anchor) return { ok: false, error: "anchor_not_found" };
      const root = anchor.parent;
      const gateway = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:ExclusiveGateway" }),
        { x: Number(anchor.x || 0) + 220, y: Number(anchor.y || 0) + 10 },
        root,
      );
      const taskYes = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(anchor.x || 0) + 430, y: Number(anchor.y || 0) - 50 },
        root,
      );
      const taskNo = modeling.createShape(
        elementFactory.createShape({ type: "bpmn:Task" }),
        { x: Number(anchor.x || 0) + 430, y: Number(anchor.y || 0) + 90 },
        root,
      );
      modeling.updateLabel(gateway, `${namePrefix}_GW`);
      modeling.updateLabel(taskYes, `${namePrefix}_YES`);
      modeling.updateLabel(taskNo, `${namePrefix}_NO`);
      const flowToGateway = modeling.connect(anchor, gateway, { type: "bpmn:SequenceFlow" });
      const flowYes = modeling.connect(gateway, taskYes, { type: "bpmn:SequenceFlow" });
      const flowNo = modeling.connect(gateway, taskNo, { type: "bpmn:SequenceFlow" });
      modeling.updateLabel(flowYes, "YES");
      modeling.updateLabel(flowNo, "NO");
      return {
        ok: true,
        gatewayId: String(gateway?.id || ""),
        flowIds: [String(flowToGateway?.id || ""), String(flowYes?.id || ""), String(flowNo?.id || "")],
      };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }, marker);
  expect(result.ok, JSON.stringify(result)).toBeTruthy();
  return result;
}

function parseProgress(textRaw) {
  const text = String(textRaw || "");
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return { current: 0, total: 0 };
  return {
    current: Number(match[1] || 0),
    total: Number(match[2] || 0),
  };
}

test("playback gateways panel drives manual gateway choices", async ({ page, request }) => {
  test.skip(process.env.E2E_PLAYBACK_GATEWAYS !== "1", "Set E2E_PLAYBACK_GATEWAYS=1 to run playback gateways panel smoke.");
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auth = await apiLogin(request, { apiBase: API_BASE });
  const fixture = await createProjectAndSession(request, auth.headers, runId);

  await setUiToken(page, auth.accessToken);
  await openSessionInTopbar(page, {
    projectId: fixture.projectId,
    sessionId: fixture.sessionId,
  });
  const diagramTab = page.locator(".segBtn").filter({ hasText: /^Diagram$/i }).first();
  await expect(diagramTab).toBeVisible();
  await diagramTab.click();
  await waitForDiagramReady(page);
  await injectGatewayBranch(page, `GW_${runId.slice(-4)}`);

  await page.getByTestId("diagram-action-playback").click();
  await expect(page.getByTestId("diagram-action-playback-popover")).toBeVisible();
  await expect(page.getByTestId("gateways-panel")).toBeVisible();

  const gatewaySelects = page.locator("[data-testid^='gateway-select-']");
  const gatewayCount = await gatewaySelects.count();
  expect(gatewayCount).toBeGreaterThan(0);
  for (let idx = 0; idx < gatewayCount; idx += 1) {
    const select = gatewaySelects.nth(idx);
    const optionCount = await select.locator("option").count();
    if (optionCount > 1) {
      await select.selectOption({ index: 1 });
    }
  }

  const manualCheckbox = page.getByTestId("diagram-action-playback-manual-gateway");
  await manualCheckbox.check({ force: true });
  await page.getByTestId("diagram-action-playback-reset").click();
  await page.getByTestId("diagram-action-playback-play").click();

  const progress = page.getByTestId("diagram-action-playback-progress");
  await expect.poll(async () => {
    const text = await progress.textContent();
    return parseProgress(text).current;
  }, { timeout: 45000 }).toBeGreaterThanOrEqual(2);

  await expect.poll(async () => {
    const typeText = await page.getByTestId("diagram-action-playback-event-type").textContent();
    return String(typeText || "").trim() !== "wait_for_gateway_decision";
  }, { timeout: 10000 }).toBeTruthy();
});
