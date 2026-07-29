// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import ImportBpmn from "./ImportBpmn.jsx";

const FIXTURE = {
  ui_model: {
    process_template_id: "proc_1",
    recipe_context: {},
    process_entities: {},
    participant: null,
    nodes: [
      {
        id: "Task_1",
        bpmn_type: "task",
        name: "Нарезка",
        operation_code: "cut_vegetables",
        display_name: "Нарезка овощей",
        params: {},
        outputs: {},
        x: 100,
        y: 100,
        width: 120,
        height: 80,
      },
      {
        id: "Task_2",
        bpmn_type: "task",
        name: "Варка",
        operation_code: "boil",
        display_name: "",
        params: { sauce_ref: "tomato_sauce" },
        outputs: {},
        x: 320,
        y: 100,
        width: 120,
        height: 80,
      },
    ],
    flows: [
      { id: "Flow_1", source_ref: "Task_1", target_ref: "Task_2", name: "", condition: "" },
    ],
  },
  report: {
    summary: { errors: 1, warnings: 1, nodes: 2, flows: 1 },
    findings: [
      {
        severity: "error",
        code: "UNDECLARED_ENTITY_REF",
        element_id: "Task_2",
        element_name: "Варка",
        message: "параметр 'sauce_ref' ссылается на необъявленную сущность 'tomato_sauce'",
        recommendation: "объявить сущность в process_entities или recipe_context",
      },
      {
        severity: "warning",
        code: "EMPTY_DISPLAY_NAME",
        element_id: "Task_2",
        element_name: "Варка",
        message: "display_name пустой",
        recommendation: "заполнить display_name",
      },
    ],
  },
  draft_entities: [
    { ref: "tomato_sauce", guessed_category: "ingredient", used_by: ["Task_2"] },
  ],
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function renderAndImport() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ImportBpmn));
  });

  const input = container.querySelector('input[type="file"]');
  expect(input).toBeTruthy();
  const file = new File(["<?xml version=\"1.0\"?><definitions/>"], "process.bpmn", { type: "text/xml" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  const submit = container.querySelector('button[type="submit"]');
  expect(submit.disabled).toBe(false);
  await act(async () => {
    submit.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  return { container, root };
}

describe("ImportBpmn", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(FIXTURE)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("posts multipart file to /api/process-templates/import-bpmn", async () => {
    await renderAndImport();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toContain("/api/process-templates/import-bpmn");
    expect(String(init.method)).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get("file")).toBeTruthy();
  });

  it("renders summary counts, findings and draft entities after import", async () => {
    const { container } = await renderAndImport();

    const summary = container.querySelector('[data-testid="import-summary"]');
    expect(summary).toBeTruthy();
    expect(summary.textContent).toContain("узлов 2");
    expect(summary.textContent).toContain("потоков 1");
    expect(summary.textContent).toContain("ошибок 1");
    expect(summary.textContent).toContain("предупреждений 1");

    const findings = container.querySelectorAll(".import-bpmn__finding");
    expect(findings.length).toBe(2);
    expect(container.textContent).toContain("UNDECLARED_ENTITY_REF");
    expect(container.textContent).toContain("EMPTY_DISPLAY_NAME");
    expect(container.textContent).toContain("объявить сущность в process_entities или recipe_context");

    // graph preview: two nodes + one flow
    expect(container.querySelectorAll(".import-bpmn__node").length).toBe(2);
    expect(container.querySelectorAll("polyline").length).toBe(1);
    expect(container.textContent).toContain("Нарезка овощей");

    // draft entities table
    const draftsTable = container.querySelector(".import-bpmn__drafts-table");
    expect(draftsTable).toBeTruthy();
    expect(draftsTable.textContent).toContain("tomato_sauce");
    expect(draftsTable.textContent).toContain("ingredient");
    expect(draftsTable.textContent).toContain("Task_2");
  });

  it("clicking a finding selects/highlights the corresponding node", async () => {
    const { container } = await renderAndImport();

    const node2 = container.querySelector('.import-bpmn__node[data-element-id="Task_2"]');
    expect(node2.getAttribute("data-selected")).toBe("false");

    const finding = container.querySelector('.import-bpmn__finding[data-element-id="Task_2"]');
    expect(finding).toBeTruthy();
    await act(async () => {
      finding.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(node2.getAttribute("data-selected")).toBe("true");
    expect(node2.classList.contains("import-bpmn__node--selected")).toBe(true);
    const node1 = container.querySelector('.import-bpmn__node[data-element-id="Task_1"]');
    expect(node1.getAttribute("data-selected")).toBe("false");
  });

  it("clicking a node selects it", async () => {
    const { container } = await renderAndImport();
    const node1 = container.querySelector('.import-bpmn__node[data-element-id="Task_1"]');
    await act(async () => {
      node1.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    expect(node1.getAttribute("data-selected")).toBe("true");
  });
});
