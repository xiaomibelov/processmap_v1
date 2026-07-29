// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import Pilots, { PilotCard, statusLabel } from "./Pilots.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const KITCHENS = [
  { id: "k1", name: "Кухня №1 (центральная)", status: "active", equipment: [] },
  { id: "k2", name: "Кухня №2 (линия РТК)", status: "active", equipment: [] },
];

const BINDING_PILOT = {
  id: "bnd_1",
  recipe_id: "49165cc0-1412-4419-96c9-82f718aa4cdf",
  recipe_version: "1.0.0",
  kitchen_ids: ["k1"],
  pilot_kitchen_id: "k1",
  status: "pilot",
  pilot_exit_criteria_json: { min_orders: 20, max_critical_errors: 0, max_defect_rate_pct: 2 },
  valid_from: null,
  valid_to: null,
  created_by: "analyst@local",
};

const BINDING_ACTIVE = { ...BINDING_PILOT, id: "bnd_2", status: "active", kitchen_ids: ["k1", "k2"] };
const BINDING_DRAFT = { ...BINDING_PILOT, id: "bnd_3", status: "draft", pilot_kitchen_id: null };

// Прогресс 14/20 заказов — min_orders не выполнен
const METRICS_BLOCKED = {
  binding_id: "bnd_1",
  status: "pilot",
  pilot_kitchen_id: "k1",
  criteria: { min_orders: 20, max_critical_errors: 0, max_defect_rate_pct: 2 },
  totals: { orders: 14, critical_errors: 0, defect_count: 0, defect_rate_pct: 0 },
  checks: [
    { key: "min_orders", label: "Заказы", current: 14, target: 20, met: false, text: "14/20" },
    { key: "max_critical_errors", label: "Критические ошибки", current: 0, target: 0, met: true, text: "0/0" },
    { key: "max_defect_rate_pct", label: "Брак", current: 1.2, target: 2, met: true, text: "1.2%/≤2%" },
  ],
  all_met: false,
  unmet: ["min_orders не выполнен: 14/20"],
  samples: [],
};

const METRICS_MET = {
  ...METRICS_BLOCKED,
  totals: { orders: 20, critical_errors: 0, defect_count: 0, defect_rate_pct: 0 },
  checks: METRICS_BLOCKED.checks.map((c) =>
    c.key === "min_orders" ? { ...c, current: 20, met: true, text: "20/20" } : c,
  ),
  all_met: true,
  unmet: [],
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeFetchMock(metrics = METRICS_BLOCKED) {
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = String(init.method || "GET").toUpperCase();
    if (u.includes("/api/sku-bindings/bnd_1/pilot-metrics")) return jsonResponse(metrics);
    if (u.includes("/api/sku-bindings/bnd_1/rollout") && method === "POST") {
      return jsonResponse({ ...BINDING_PILOT, status: "active", kitchen_ids: ["k1", "k2"] });
    }
    if (u.includes("/api/sku-bindings")) return jsonResponse([BINDING_PILOT, BINDING_ACTIVE, BINDING_DRAFT]);
    if (u.includes("/api/kitchens")) return jsonResponse(KITCHENS);
    return jsonResponse({ error: `unmocked ${method} ${u}` }, 404);
  });
}

let container;
let root;

beforeEach(() => {
  window.localStorage.setItem("fpc_auth_access_token", "test-token");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function q(testid) {
  return container.querySelector(`[data-testid="${testid}"]`);
}

describe("PilotCard (E9.6)", () => {
  it("renders progress towards exit criteria", () => {
    act(() => {
      root.render(
        React.createElement(PilotCard, {
          binding: BINDING_PILOT,
          metrics: METRICS_BLOCKED,
          kitchensById: { k1: KITCHENS[0] },
          busy: false,
          onRollout: () => {},
        }),
      );
    });
    expect(q("pilot-check-min_orders").textContent).toContain("Заказы");
    expect(q("pilot-check-min_orders").textContent).toContain("14/20");
    expect(q("pilot-check-max_critical_errors").textContent).toContain("0/0");
    expect(q("pilot-check-max_defect_rate_pct").textContent).toContain("1.2%/≤2%");
    expect(q("pilot-card").textContent).toContain("Кухня №1 (центральная)");
  });

  it("disables «Раскатать» with tooltip reason until criteria are met", () => {
    act(() => {
      root.render(
        React.createElement(PilotCard, {
          binding: BINDING_PILOT,
          metrics: METRICS_BLOCKED,
          kitchensById: { k1: KITCHENS[0] },
          busy: false,
          onRollout: () => {},
        }),
      );
    });
    const button = q("rollout-button");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toContain("min_orders не выполнен: 14/20");
    expect(q("pilot-unmet").textContent).toContain("min_orders не выполнен: 14/20");
  });

  it("enables «Раскатать» when all criteria are met", () => {
    act(() => {
      root.render(
        React.createElement(PilotCard, {
          binding: BINDING_PILOT,
          metrics: METRICS_MET,
          kitchensById: { k1: KITCHENS[0] },
          busy: false,
          onRollout: () => {},
        }),
      );
    });
    const button = q("rollout-button");
    expect(button.disabled).toBe(false);
    expect(q("pilot-check-min_orders").textContent).toContain("20/20");
  });
});

describe("Pilots screen (E9.6)", () => {
  it("renders bindings list with statuses", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await act(async () => {
      root.render(React.createElement(Pilots));
    });
    await flush();
    await flush();
    expect(q("binding-status-bnd_1").textContent).toBe("Пилот");
    expect(q("binding-status-bnd_2").textContent).toBe("Активен");
    expect(q("binding-status-bnd_3").textContent).toBe("Черновик");
    // первая привязка выбрана автоматически — карточка пилота с прогрессом
    expect(q("pilot-card")).toBeTruthy();
    expect(q("rollout-button").disabled).toBe(true);
    expect(q("rollout-button").getAttribute("title")).toContain("min_orders не выполнен: 14/20");
  });

  it("enables rollout button when metrics meet criteria", async () => {
    vi.stubGlobal("fetch", makeFetchMock(METRICS_MET));
    await act(async () => {
      root.render(React.createElement(Pilots));
    });
    await flush();
    await flush();
    expect(q("rollout-button").disabled).toBe(false);
  });

  it("statusLabel maps contour statuses", () => {
    expect(statusLabel("draft")).toBe("Черновик");
    expect(statusLabel("pilot")).toBe("Пилот");
    expect(statusLabel("active")).toBe("Активен");
    expect(statusLabel("retired")).toBe("Выведен");
  });
});
