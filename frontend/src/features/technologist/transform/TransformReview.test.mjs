// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import TransformReview from "./TransformReview.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FIXTURE = {
  as_is_ui_model: {
    nodes: [
      { id: "Task_a", bpmn_type: "manualTask", name: "Перенести контейнер-1 в СВЧ-1", x: 0, y: 0, width: 100, height: 80 },
      { id: "Task_b", bpmn_type: "manualTask", name: "Открыть урну-1", x: 200, y: 0, width: 100, height: 80 },
    ],
    flows: [{ id: "F1", source_ref: "Task_a", target_ref: "Task_b", name: "", condition: "" }],
    lanes: [],
  },
  draft_ui_model: {
    process_template_id: "p_tobe_draft",
    recipe_context: {},
    process_entities: {},
    nodes: [
      {
        id: "Task_a",
        bpmn_type: "task",
        name: "Перенести контейнер-1 в СВЧ-1",
        operation_code: "move",
        params: { object_ref: "container_1", target_ref: "microwave_1" },
        outputs: {},
        recipe_params: [],
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        derived_from: ["Task_a"],
      },
    ],
    flows: [],
    lanes: [],
  },
  trace_map: [
    {
      element_id: "Task_a",
      element_type: "manualTask",
      name: "Перенести контейнер-1 в СВЧ-1",
      fate: "transformed_to",
      rule_id: "R01_move",
      rule_name: "Перемещение объекта/тары",
      draft_node_ids: ["Task_a"],
      note: "атомарная операция move",
    },
    {
      element_id: "Task_b",
      element_type: "manualTask",
      name: "Открыть урну-1",
      fate: "pushed_below",
      rule_id: "R03_open_bin_below",
      rule_name: "Открытие урны — ниже схемы",
      draft_node_ids: [],
      note: "часть execution_contract",
    },
  ],
  open_questions: [
    { id: "OQ_001", element_id: "", question: "Подтвердите capability измерения температуры", source: "analyzer", status: "open" },
  ],
  validation_report: { summary: { errors: 0, warnings: 2, nodes: 1, flows: 0 }, findings: [] },
  draft_entities: [{ ref: "microwave_1", guessed_category: "equipment", used_by: ["Task_a"] }],
  llm_status: "offline",
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

async function renderAndTransform() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TransformReview));
  });

  const input = container.querySelector('input[type="file"]');
  const file = new File(["<?xml version=\"1.0\"?><definitions/>"], "asis.bpmn", { type: "text/xml" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  const submit = container.querySelector('button[type="submit"]');
  await act(async () => {
    submit.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  return { container, root };
}

describe("TransformReview", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(FIXTURE)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    window.sessionStorage?.clear();
  });

  it("posts file to /api/process-templates/transform-asis", async () => {
    await renderAndTransform();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toContain("/api/process-templates/transform-asis");
    expect(String(init.method)).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("renders side-by-side graphs, decisions and open questions", async () => {
    const { container } = await renderAndTransform();
    expect(container.querySelectorAll("svg.graph-canvas").length).toBe(2);
    const summary = container.querySelector('[data-testid="transform-summary"]');
    expect(summary.textContent).toContain("ошибок валидатора 0");
    expect(container.textContent).toContain("R01_move");
    expect(container.textContent).toContain("R03_open_bin_below");
    expect(container.textContent).toContain("Подтвердите capability измерения температуры");
  });

  it("clicking AS IS node highlights derived draft node", async () => {
    const { container } = await renderAndTransform();
    const asisNode = container.querySelector('.transform-review__pane:first-child [data-element-id="Task_a"]');
    await act(async () => {
      asisNode.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    const draftNode = container.querySelector('.transform-review__pane:nth-child(2) [data-element-id="Task_a"]');
    expect(draftNode.getAttribute("data-selected")).toBe("true");
  });

  it("reject removes element from draft, accept restores it", async () => {
    const { container } = await renderAndTransform();
    const decision = container.querySelector('.transform-review__decision[data-element-id="Task_a"]');
    const rejectBtn = decision.querySelector(".transform-review__reject");
    await act(async () => {
      rejectBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelectorAll('.transform-review__pane:nth-child(2) .graph-canvas__node').length).toBe(0);

    const acceptBtn = decision.querySelector(".transform-review__accept");
    await act(async () => {
      acceptBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelectorAll('.transform-review__pane:nth-child(2) .graph-canvas__node').length).toBe(1);
  });

  it("open-in-constructor stores fpc_e4_handoff handoff", async () => {
    const { container } = await renderAndTransform();
    const btn = container.querySelector(".transform-review__to-constructor");
    await act(async () => {
      btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    const raw = window.sessionStorage.getItem("fpc_e4_handoff");
    expect(raw).toBeTruthy();
    const payload = JSON.parse(raw);
    expect(payload.ui_model.process_template_id).toBe("p_tobe_draft");
    expect(payload.draft_entities[0].ref).toBe("microwave_1");
  });
});
