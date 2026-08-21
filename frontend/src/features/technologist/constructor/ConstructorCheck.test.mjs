// @vitest-environment jsdom
// E6.5 — «Проверить» в конструкторе: dry-run findings + pre-check по кухням.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import Constructor, { E4_HANDOFF_KEY } from "./Constructor.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OP_LIST = [{ code: "cut", name: "Нарезка", category: "prep" }];

const KITCHENS = [
  { id: "k1", name: "Кухня №1 (центральная)", location: "Цех А", status: "active", equipment: [] },
  { id: "k2", name: "Кухня №2 (линия РТК)", location: "Цех Б", status: "active", equipment: [] },
  { id: "k3", name: "Кухня №3 (без датчиков)", location: "Цех В", status: "active", equipment: [] },
];

const VALIDATE_RESPONSE = {
  valid: false,
  summary: { errors: 1, warnings: 1, nodes: 3, flows: 2 },
  findings: [
    {
      severity: "error",
      code: "UNREACHABLE_NODE",
      element_id: "Task_1",
      element_name: "Нарезка",
      message: "узел недостижим из стартового события",
      recommendation: "соединить потоком от старта",
    },
    {
      severity: "warning",
      code: "UNDECLARED_ENTITY_REF",
      element_id: "Task_1",
      element_name: "Нарезка",
      message: "параметр 'container_ref' ссылается на необъявленную сущность 'tank_1'",
      recommendation: "объявить сущность",
    },
  ],
  draft_entities: [],
};

function precheckResponse(ids) {
  const verdicts = { k1: "ok", k2: "ok", k3: "blocked" };
  return {
    mode: "strict",
    summary: { kitchens: ids.length, ok: 2, warning: 0, blocked: 1 },
    required_equipment: [{ operation_code: "cut", equipment: ["mixer"] }],
    kitchens: ids.map((id) => ({
      kitchen_id: id,
      name: KITCHENS.find((k) => k.id === id)?.name || id,
      verdict: verdicts[id] || "ok",
      unmet:
        id === "k3"
          ? [{ operation_code: "cut", requirement: "mixer", detail_ru: "Операция 'cut' требует оборудование 'mixer' — отсутствует на кухне" }]
          : [],
    })),
  };
}

function makeModel() {
  return {
    process_template_id: "proc_1",
    recipe_context: {},
    process_entities: { containers: {}, equipment: {}, zones: {} },
    participant: null,
    nodes: [
      { id: "StartEvent_1", bpmn_type: "startEvent", name: "Старт", display_name: "", params: {}, outputs: {}, recipe_params: [], x: 40, y: 100, width: 40, height: 40 },
      { id: "Task_1", bpmn_type: "task", name: "Нарезка", operation_code: "cut", display_name: "Нарезка", params: {}, outputs: {}, recipe_params: [], x: 140, y: 100, width: 140, height: 70 },
      { id: "EndEvent_1", bpmn_type: "endEvent", name: "Финиш", display_name: "", params: {}, outputs: {}, recipe_params: [], x: 340, y: 100, width: 40, height: 40 },
    ],
    flows: [
      { id: "Flow_1", source_ref: "StartEvent_1", target_ref: "Task_1", name: "", condition: "" },
      { id: "Flow_2", source_ref: "Task_1", target_ref: "EndEvent_1", name: "", condition: "" },
    ],
    lanes: [],
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeFetchMock() {
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = String(init.method || "GET").toUpperCase();
    if (u.includes("/api/operation-catalog")) return jsonResponse(OP_LIST);
    if (u.includes("/api/dictionaries/")) return jsonResponse([]);
    if (u.includes("/api/process-templates/validate") && method === "POST") {
      return jsonResponse(VALIDATE_RESPONSE);
    }
    if (u.includes("/api/process-templates/precheck") && method === "POST") {
      const body = JSON.parse(String(init.body));
      return jsonResponse(precheckResponse(body.kitchen_ids || []));
    }
    if (u.includes("/api/kitchens") && method === "GET") return jsonResponse(KITCHENS);
    return jsonResponse({ error: `unmocked ${method} ${u}` }, 404);
  });
}

async function renderConstructor() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Constructor));
  });
  return { container, root };
}

async function click(el) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

describe("Constructor check panel (E6.5)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetchMock());
    window.sessionStorage.clear();
    window.history.pushState({}, "", "/technologist/constructor?from=import");
    window.sessionStorage.setItem(E4_HANDOFF_KEY, JSON.stringify({ ui_model: makeModel(), draft_entities: [] }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    window.sessionStorage.clear();
  });

  it("«Проверить» renders two sections: dry-run findings + kitchen pre-check", async () => {
    const { container } = await renderConstructor();
    await click(container.querySelector('[data-testid="check-reachability"]'));

    const findings = container.querySelector('[data-testid="check-findings"]');
    const precheck = container.querySelector('[data-testid="check-precheck"]');
    expect(findings, "dry-run findings section").toBeTruthy();
    expect(precheck, "kitchen pre-check section").toBeTruthy();

    // summary + findings list
    expect(findings.querySelector('[data-testid="check-summary"]').textContent).toContain("ошибок 1");
    const findingButtons = findings.querySelectorAll('[data-testid^="check-finding-"]');
    expect(findingButtons.length).toBe(2);
    expect(findingButtons[0].textContent).toContain("UNREACHABLE_NODE");

    // kitchen checkboxes: 3 kitchens, all selected by default
    const boxes = precheck.querySelectorAll('[data-testid^="precheck-kitchen-"] input[type="checkbox"]');
    expect(boxes.length).toBe(3);
    boxes.forEach((box) => expect(box.checked).toBe(true));

    // coverage table with verdict badges
    const table = precheck.querySelector('[data-testid="precheck-table"]');
    expect(table).toBeTruthy();
    expect(precheck.querySelector('[data-testid="precheck-verdict-k1"]').getAttribute("data-verdict")).toBe("ok");
    expect(precheck.querySelector('[data-testid="precheck-verdict-k2"]').getAttribute("data-verdict")).toBe("ok");
    const blocked = precheck.querySelector('[data-testid="precheck-verdict-k3"]');
    expect(blocked.getAttribute("data-verdict")).toBe("blocked");
    expect(blocked.className).toContain("ctor-check__badge--blocked");
    expect(precheck.textContent).toContain("Кухня №3 (без датчиков)");
    expect(precheck.textContent).toContain("mixer");
  });

  it("finding click highlights the element on GraphCanvas", async () => {
    const { container } = await renderConstructor();
    await click(container.querySelector('[data-testid="check-reachability"]'));

    const node = container.querySelector('.graph-canvas__node[data-element-id="Task_1"]');
    expect(node.getAttribute("data-selected")).toBe("false");

    await click(container.querySelector('[data-testid="check-finding-0"]'));
    expect(node.getAttribute("data-selected")).toBe("true");
  });

  it("kitchen selection: unchecking a kitchen re-runs pre-check without it", async () => {
    const { container } = await renderConstructor();
    await click(container.querySelector('[data-testid="check-reachability"]'));

    const fetchMock = globalThis.fetch;
    const callsBefore = fetchMock.mock.calls.filter(
      ([u, i]) => String(u).includes("/precheck") && String(i?.method || "GET") === "POST",
    ).length;
    expect(callsBefore).toBe(1);

    // uncheck k3
    const k3box = container.querySelector('[data-testid="precheck-kitchen-k3"] input[type="checkbox"]');
    await click(k3box);
    expect(k3box.checked).toBe(false);

    await click(container.querySelector('[data-testid="precheck-run"]'));
    const calls = fetchMock.mock.calls.filter(
      ([u, i]) => String(u).includes("/precheck") && String(i?.method || "GET") === "POST",
    );
    expect(calls.length).toBe(2);
    const lastBody = JSON.parse(String(calls[1][1].body));
    expect(lastBody.kitchen_ids).toEqual(["k1", "k2"]);

    // blocked row disappears after re-run
    expect(container.querySelector('[data-testid="precheck-verdict-k3"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="precheck-verdict-k1"]')).toBeTruthy();
  });
});
