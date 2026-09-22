import { expect, test } from "@playwright/test";

// E2E контура feature/canvas-telemetry-feed (TESTS.md: E1–E4).
// Страница /admin/canvas-telemetry читает только витрину
// (GET /api/admin/canvas-telemetry/errors + /context); лента клиента шлёт
// батчи в POST /api/telemetry/canvas-events отдельным транспортом вне throttle
// telemetryClient; kill-switch __FPC_CANVAS_FEED_OFF__ гасит запись.

function jsonResponse(payload, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  };
}

const GROUP_422 = {
  id: "grp_1",
  session_id: "s_1e4e833505",
  user_id: "u_7",
  project_id: "p_1",
  org_id: "org_a",
  error_class: "ops_422",
  error_code: "OPERATION_UNSUPPORTED",
  op_type: "move",
  op_id: "op_x",
  message: "bpmn_xml_parse_error",
  first_seen: 1727000000,
  last_seen: 1727000100,
  count: 3,
  converged: 0,
  updated_at: 1727000100,
};

const CONTEXT_TIMELINE = [
  {
    kind: "command",
    ts: 1727000000,
    event_id: "cev_1",
    payload: { command: { type: "shape.move", action: "execute", elementIds: ["Task_1", "Task_2"] } },
  },
  {
    kind: "error",
    ts: 1727000087,
    event_id: "cev_2",
    payload: {
      http: { status: 422, latencyMs: 87, endpoint: "/api/sessions/s_1e4e833505/operations" },
      error: { code: "OPERATION_UNSUPPORTED", opId: "op_x", opType: "move", reason: "bpmn_xml_parse_error" },
      versions: { clientBase: 41 },
    },
  },
  {
    kind: "save_status",
    ts: 1727000090,
    event_id: "cev_3",
    payload: { ux: { state: "failed", opsStage: "ops-unsupported" } },
  },
];

function installAuthInitScript(page) {
  return page.addInitScript(() => {
    window.localStorage.setItem("fpc_auth_access_token", "admin-token");
    window.localStorage.setItem("fpc_active_org_id", "org_a");
  });
}

test("E1+E2: список витрины и таймлайн 422 с контекстом", async ({ page }) => {
  await installAuthInitScript(page);
  let contextRequests = 0;
  await page.route("**/*", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method().toUpperCase();
    if (!path.startsWith("/api/")) return route.continue();
    if (path === "/api/auth/me" && method === "GET") {
      return route.fulfill(jsonResponse({ id: "u_admin", email: "admin@local", is_admin: true }));
    }
    if (path === "/api/orgs" && method === "GET") {
      return route.fulfill(jsonResponse({ items: [{ org_id: "org_a", name: "Org A", role: "org_admin" }] }));
    }
    if (path === "/api/admin/canvas-telemetry/errors" && method === "GET") {
      return route.fulfill(jsonResponse({ items: [GROUP_422], page: { limit: 50, offset: 0, total: 1 } }));
    }
    if (path === "/api/admin/canvas-telemetry/errors/grp_1/context" && method === "GET") {
      contextRequests += 1;
      return route.fulfill(jsonResponse({
        item: GROUP_422,
        timeline: CONTEXT_TIMELINE,
        session_url: "/?session=s_1e4e833505&project=p_1",
      }));
    }
    return route.continue();
  });

  await page.goto("/admin/canvas-telemetry");
  await expect(page.getByTestId("canvas-telemetry-error-list")).toBeVisible();
  await expect(page.getByText("OPERATION_UNSUPPORTED")).toBeVisible();
  await expect(page.getByTestId("canvas-telemetry-error-list").getByText("дивергенция")).toBeVisible();

  await page.getByRole("button", { name: "Таймлайн" }).click();
  await expect(page.getByTestId("canvas-telemetry-timeline")).toBeVisible();
  await expect(page.getByText("shape.move").first()).toBeVisible();
  await expect(page.getByText("HTTP 422").first()).toBeVisible();
  expect(contextRequests).toBeGreaterThan(0);
});

// Живые сценарии ingest (без стаббинга canvas-events): реальный логин
// seeded-admin, реальная сессия-фикстура, правки канваса через modeling-API,
// реальный backend принимает батчи (201) и пишет canvas_event_raw.
// Flush ленты — таймер 10–15 с, поэтому после правки ждём окно флаша.

import { apiLogin, setUiToken } from "./helpers/e2eAuth.mjs";
import { createFixture, openFixture, renameTask, seedXml } from "./helpers/processFixture.mjs";
import { waitForDiagramReady } from "./helpers/diagramReady.mjs";

const FLUSH_WINDOW_MS = 18_000;

function countCanvasEventsPosts(page, counter) {
  return page.route("**/api/telemetry/canvas-events", async (route, request) => {
    if (request.method().toUpperCase() === "POST") counter.posts += 1;
    return route.continue();
  });
}

async function openLiveSession({ page, request }, runId) {
  const auth = await apiLogin(request, {});
  const fixture = await createFixture(request, runId, auth.headers, seedXml());
  await setUiToken(page, auth.accessToken, { activeOrgId: auth.activeOrgId || fixture.orgId });
  await openFixture(page, fixture);
  await waitForDiagramReady(page);
  // viewport-сентинел не гарантирует отрисовку элементов — ждём DOM-ноду таски
  await page.locator('[data-element-id="Task_1"]').first().waitFor({ state: "visible", timeout: 30_000 });
  return fixture;
}

test("E3: kill-switch __FPC_CANVAS_FEED_OFF__ блокирует отправку батчей", async ({ page, request }) => {
  await page.addInitScript(() => {
    window.__FPC_CANVAS_FEED_OFF__ = true;
  });
  const counter = { posts: 0 };
  await countCanvasEventsPosts(page, counter);
  await openLiveSession({ page, request }, `kill-${Date.now()}`);

  await renameTask(page, "Task_1", "kill-switch off");
  await page.waitForTimeout(FLUSH_WINDOW_MS);
  expect(counter.posts).toBe(0);

  // снятие флага → лента оживает, батчи реально уходят на backend
  await page.evaluate(() => {
    window.__FPC_CANVAS_FEED_OFF__ = false;
  });
  await renameTask(page, "Task_1", "kill-switch on");
  await page.waitForTimeout(FLUSH_WINDOW_MS);
  expect(counter.posts).toBeGreaterThan(0);
});

test("E4: правки канваса → реальные POST canvas-events независимо от throttle error-events", async ({ page, request }) => {
  const counter = { posts: 0 };
  await countCanvasEventsPosts(page, counter);
  await openLiveSession({ page, request }, `live-${Date.now()}`);

  await renameTask(page, "Task_1", "live edit 1");
  await page.waitForTimeout(FLUSH_WINDOW_MS);
  expect(counter.posts).toBeGreaterThan(0);
});
