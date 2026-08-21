// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import AuditHistory, { buildEventLine, eventDiffLines, formatTs } from "./AuditHistory.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const EVENTS = [
  {
    id: "aud_1",
    ts: 1785336428, // 2026-07-29
    actor_user_id: "u1",
    actor_email: "technologist@local",
    actor_display: "technologist@local",
    actor_resolved: true,
    action: "recipe.update",
    entity_type: "recipe",
    entity_id: "rcp_1",
    status: "ok",
    meta: {
      diff_json: { target_temp_c: { old: 75, new: 80 } },
      diff_lines: ["target_temp_c: 75 → 80"],
    },
  },
  {
    id: "aud_2",
    ts: 1785336500,
    actor_user_id: "u1",
    actor_email: "technologist@local",
    actor_display: "technologist@local",
    actor_resolved: true,
    action: "publish",
    entity_type: "recipe",
    entity_id: "rcp_1",
    status: "ok",
    meta: {
      version: "1.0.1",
      previous_version: "1.0.0",
      diff_json: { heat_time_sec: { old: 90, new: 100 } },
      diff_lines: ["heat_time_sec: 90 → 100"],
    },
  },
  {
    id: "aud_3",
    ts: 1785336600,
    actor_user_id: "ghost",
    actor_email: null,
    actor_display: "пользователь удалён/внешний",
    actor_resolved: false,
    action: "recipe.update",
    entity_type: "recipe",
    entity_id: "rcp_2",
    status: "ok",
    meta: { diff_json: { portion_qty: { old: 2, new: 4 } } },
  },
];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeFetchMock(calls) {
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/api/audit-log")) return jsonResponse({ items: EVENTS, limit: 100, offset: 0, count: EVENTS.length });
    return jsonResponse({ error: `unmocked ${u}` }, 404);
  });
}

let container;
let root;
let calls;

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", makeFetchMock(calls));
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

function qAll(testid) {
  return [...container.querySelectorAll(`[data-testid="${testid}"]`)];
}

describe("audit helpers", () => {
  it("formats ts as YYYY-MM-DD HH:MM", () => {
    expect(formatTs(1785336428)).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/); // L5: русская локаль
    expect(formatTs(0)).toBe("—");
  });

  it("builds human diff line with author, date and version", () => {
    const line = buildEventLine(EVENTS[1], "heat_time_sec: 90 → 100");
    expect(line).toContain("heat_time_sec: 90 → 100");
    expect(line).toContain("technologist@local");
    expect(line).toContain("v1.0.1");
    expect(line).toMatch(/·/);
  });

  it("falls back to diff_json when diff_lines missing", () => {
    expect(eventDiffLines(EVENTS[2])).toEqual(["portion_qty: 2 → 4"]);
  });
});

describe("AuditHistory (E8.3)", () => {
  it("renders human-readable diff lines from the journal", async () => {
    await act(async () => {
      root.render(React.createElement(AuditHistory, { entityType: "recipe", entityId: "rcp_1" }));
    });
    await flush();
    await flush();

    const lines = qAll("audit-line").map((el) => el.textContent);
    expect(lines.some((l) => l.includes("target_temp_c: 75 → 80"))).toBe(true);
    expect(lines.some((l) => l.includes("heat_time_sec: 90 → 100") && l.includes("v1.0.1"))).toBe(true);
    // unresolved actor renders as external/deleted, no crash
    expect(lines.some((l) => l.includes("пользователь удалён/внешний"))).toBe(true);
    // initial request carries entity filter
    expect(calls[0]).toContain("entity_type=recipe");
    expect(calls[0]).toContain("entity_id=rcp_1");
  });

  it("applies entity filter from the filter bar", async () => {
    await act(async () => {
      root.render(React.createElement(AuditHistory, { showFilters: true }));
    });
    await flush();
    await flush();

    const typeSelect = q("filter-entity-type");
    const idInput = q("filter-entity-id");
    await act(async () => {
      typeSelect.value = "recipe";
      typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // React controlled select: emulate via native setter
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
      setter.call(typeSelect, "recipe");
      typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      inputSetter.call(idInput, "rcp_9");
      idInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      q("filter-apply").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    await flush();

    const last = calls[calls.length - 1];
    expect(last).toContain("entity_type=recipe");
    expect(last).toContain("entity_id=rcp_9");
  });
});
