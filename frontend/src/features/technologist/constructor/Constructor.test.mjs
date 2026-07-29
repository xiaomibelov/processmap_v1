// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import Constructor, { E4_HANDOFF_KEY } from "./Constructor.jsx";
import {
  GATEWAY_CONDITION_UNKNOWN_OUTPUT,
  computeReachable,
  findRefUsages,
  gatewayConditionError,
  normalizeUiModel,
  renameEntityRef,
} from "./modelUtils.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OP_LIST = [
  { code: "cut", name: "Нарезка", category: "prep" },
  { code: "boil", name: "Варка", category: "thermal" },
];

const OP_DETAILS = {
  cut: {
    code: "cut",
    name: "Нарезка",
    parameter_schema: {
      volume: { type: "number", required: true, default: "" },
      sauce_ref: { type: "string", required: false },
    },
    allowed_outputs: [{ name: "cut_done", type: "success" }],
    execution_contract: {},
    resource_requirements: {},
    category: "prep",
  },
  boil: {
    code: "boil",
    name: "Варка",
    parameter_schema: {
      duration: { type: "number", required: true },
    },
    allowed_outputs: [{ name: "boiled", type: "success" }],
    execution_contract: {},
    resource_requirements: {},
    category: "thermal",
  },
};

const DICTS = {
  "container-types": [{ code: "tank", name: "Танк" }],
  "equipment-types": [{ code: "mixer", name: "Миксер" }],
  "zone-types": [{ code: "hall", name: "Цех" }],
};

function makeModel() {
  return {
    process_template_id: "proc_1",
    recipe_context: { batch_size: "" },
    process_entities: {
      containers: { tank_1: { type_id: "tank" } },
      equipment: {},
      zones: {},
    },
    participant: null,
    nodes: [
      { id: "StartEvent_1", bpmn_type: "startEvent", name: "Старт", display_name: "", params: {}, outputs: {}, recipe_params: [], x: 40, y: 100, width: 40, height: 40 },
      { id: "Task_1", bpmn_type: "task", name: "Нарезка", operation_code: "cut", display_name: "Нарезка", params: { volume: "5", container_ref: "tank_1" }, outputs: { cut_done: "cut_done" }, recipe_params: [], x: 140, y: 100, width: 140, height: 70 },
      { id: "Gateway_1", bpmn_type: "exclusiveGateway", name: "", display_name: "", params: {}, outputs: {}, recipe_params: [], x: 340, y: 105, width: 60, height: 60 },
      { id: "Task_2", bpmn_type: "task", name: "Варка", operation_code: "boil", display_name: "Варка", params: {}, outputs: {}, recipe_params: [], x: 460, y: 100, width: 140, height: 70 },
      { id: "Task_orphan", bpmn_type: "task", name: "Сирота", operation_code: "boil", display_name: "Сирота", params: {}, outputs: {}, recipe_params: [], x: 140, y: 320, width: 140, height: 70 },
    ],
    flows: [
      { id: "Flow_1", source_ref: "StartEvent_1", target_ref: "Task_1", name: "", condition: "" },
      { id: "Flow_2", source_ref: "Task_1", target_ref: "Gateway_1", name: "", condition: "" },
      { id: "Flow_3", source_ref: "Gateway_1", target_ref: "Task_2", name: "", condition: "" },
    ],
    lanes: [],
  };
}

const TEMPLATE_FULL = {
  id: "tpl_1",
  name: "Существующий шаблон",
  version: "0.2.0",
  status: "draft",
  ui_model: makeModel(),
};

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
    if (u.includes("/api/operation-catalog/")) {
      const code = u.split("/api/operation-catalog/")[1].split("?")[0];
      const detail = OP_DETAILS[decodeURIComponent(code)];
      return detail ? jsonResponse(detail) : jsonResponse({ error: "not found" }, 404);
    }
    if (u.includes("/api/operation-catalog")) return jsonResponse(OP_LIST);
    for (const [dict, items] of Object.entries(DICTS)) {
      if (u.includes(`/api/dictionaries/${dict}`)) return jsonResponse(items);
    }
    if (u.includes("/api/process-templates/tpl_1") && method === "GET") return jsonResponse(TEMPLATE_FULL);
    if (u.includes("/api/process-templates/tpl_1") && method === "PUT") {
      return jsonResponse({ id: "tpl_1", ...JSON.parse(String(init.body)) });
    }
    if (u.includes("/api/process-templates") && method === "GET") {
      return jsonResponse([{ id: "tpl_1", name: TEMPLATE_FULL.name, version: "0.2.0", status: "draft" }]);
    }
    if (u.includes("/api/process-templates") && method === "POST") {
      return jsonResponse({ id: "tpl_new", ...JSON.parse(String(init.body)) }, 201);
    }
    return jsonResponse({ error: `unmocked ${method} ${u}` }, 404);
  });
}

function setLocation(path) {
  window.history.pushState({}, "", path);
}

function setHandoff(uiModel) {
  window.sessionStorage.setItem(E4_HANDOFF_KEY, JSON.stringify({ ui_model: uiModel, draft_entities: [] }));
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

function setInputValue(input, value) {
  const proto = input instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new window.Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

async function click(el) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

async function selectNode(container, nodeId) {
  const g = container.querySelector(`.graph-canvas__node[data-element-id="${nodeId}"]`);
  expect(g, `node ${nodeId} on canvas`).toBeTruthy();
  await click(g);
}

async function selectFlow(container, flowId) {
  const line = container.querySelector(`[data-flow-id="${flowId}"] polyline`);
  expect(line, `flow ${flowId} on canvas`).toBeTruthy();
  await click(line);
}

describe("Constructor (E4)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", makeFetchMock());
    window.sessionStorage.clear();
    setLocation("/technologist/constructor");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    window.sessionStorage.clear();
  });

  it("loads ui_model from E3 import handoff (?from=import)", async () => {
    setHandoff(makeModel());
    setLocation("/technologist/constructor?from=import");
    const { container } = await renderConstructor();
    expect(container.querySelectorAll(".graph-canvas__node").length).toBe(5);
    expect(container.querySelectorAll("polyline").length).toBe(3);
    expect(container.querySelector('[data-testid="version-label"]').textContent).toContain("Черновик");
    // handoff consumed
    expect(window.sessionStorage.getItem(E4_HANDOFF_KEY)).toBe(null);
  });

  it("block form: required param missing → save disabled; filled → enabled", async () => {
    setHandoff(makeModel());
    setLocation("/technologist/constructor?from=import");
    const { container } = await renderConstructor();

    await selectNode(container, "Task_2"); // boil: required `duration`, params empty
    const form = container.querySelector('[data-testid="block-form"]');
    expect(form).toBeTruthy();
    await act(async () => {}); // let operation detail load

    const saveBtn = form.querySelector('[data-testid="block-save"]');
    expect(saveBtn.disabled).toBe(true);
    expect(form.querySelector('[data-testid="block-required-hint"]').textContent).toContain("duration");

    const input = form.querySelector('[data-testid="param-duration"]');
    expect(input).toBeTruthy();
    await act(async () => {
      setInputValue(input, "30");
    });
    expect(saveBtn.disabled).toBe(false);

    await click(saveBtn);
    // saved into ui_model: re-select node and check persisted param via form
    await selectNode(container, "Task_2");
    const form2 = container.querySelector('[data-testid="block-form"]');
    expect(form2.querySelector('[data-testid="param-duration"]').value).toBe("30");
  });

  it("entity ref param renders dropdown with declared refs only", async () => {
    setHandoff(makeModel());
    setLocation("/technologist/constructor?from=import");
    const { container } = await renderConstructor();

    await selectNode(container, "Task_1"); // cut: has `sauce_ref` param (not required)
    await act(async () => {}); // operation detail

    const select = container.querySelector('[data-testid="param-sauce_ref"]');
    expect(select).toBeTruthy();
    expect(select.tagName).toBe("SELECT");
    const values = Array.from(select.options).map((o) => o.value);
    // placeholder + entity refs (tank_1) + recipe_context keys (batch_size); no free input
    expect(values).toEqual(["", "tank_1", "batch_size"]);

    // existing *_ref param value also rendered as dropdown
    const containerRef = container.querySelector('[data-testid="param-container_ref"]');
    expect(containerRef.tagName).toBe("SELECT");
    expect(containerRef.value).toBe("tank_1");
  });

  it("gateway condition dropdown limited to preceding tasks' declared outputs", async () => {
    setHandoff(makeModel());
    setLocation("/technologist/constructor?from=import");
    const { container } = await renderConstructor();

    await selectFlow(container, "Flow_3"); // Gateway_1 -> Task_2
    const form = container.querySelector('[data-testid="flow-form"]');
    expect(form).toBeTruthy();
    const select = form.querySelector('[data-testid="flow-condition"]');
    expect(select).toBeTruthy();
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["", "cut_done"]);

    await act(async () => {
      setInputValue(select, "cut_done");
    });
    expect(container.querySelector('[data-testid="flow-condition-error"]')).toBe(null);
  });

  it("invalid manual gateway condition rejected with GATEWAY_CONDITION_UNKNOWN_OUTPUT hint", async () => {
    const model = makeModel();
    model.flows[2].condition = "bogus_output";
    setHandoff(model);
    setLocation("/technologist/constructor?from=import");
    const { container } = await renderConstructor();

    await selectFlow(container, "Flow_3");
    const err = container.querySelector('[data-testid="flow-condition-error"]');
    expect(err).toBeTruthy();
    expect(err.textContent).toContain(GATEWAY_CONDITION_UNKNOWN_OUTPUT);
    expect(err.textContent).toContain("bogus_output");

    // pure helper semantics
    const normalized = normalizeUiModel(model);
    expect(gatewayConditionError(normalized, normalized.flows[2])).toBe(GATEWAY_CONDITION_UNKNOWN_OUTPUT);
    expect(gatewayConditionError(normalized, { ...normalized.flows[2], condition: "cut_done" })).toBe("");
  });

  it("entity delete blocked when referenced — dialog lists referencing blocks", async () => {
    setHandoff(makeModel());
    setLocation("/technologist/constructor?from=import");
    const { container } = await renderConstructor();

    await click(container.querySelector('[data-testid="tab-entities"]'));
    const deleteBtn = container.querySelector('[data-testid="entity-delete-tank_1"]');
    expect(deleteBtn).toBeTruthy();
    await click(deleteBtn);

    const dialog = container.querySelector('[data-testid="entity-delete-blocked"]');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("tank_1");
    expect(dialog.textContent).toContain("Нарезка");
    expect(dialog.textContent).toContain("container_ref");

    await click(dialog.querySelector('[data-testid="delete-blocked-ok"]'));
    // entity still present
    expect(container.querySelector('[data-entity-ref="tank_1"]')).toBeTruthy();

    // pure helper: usages found
    const usages = findRefUsages(normalizeUiModel(makeModel()), "tank_1");
    expect(usages.map((u) => u.nodeId)).toEqual(["Task_1"]);
  });

  it("rename entity with confirmation updates all referencing params", async () => {
    setHandoff(makeModel());
    setLocation("/technologist/constructor?from=import");
    const { container } = await renderConstructor();

    await click(container.querySelector('[data-testid="tab-entities"]'));
    await click(container.querySelector('[data-testid="entity-rename-tank_1"]'));
    const input = container.querySelector('[data-testid="entity-rename-input"]');
    await act(async () => {
      setInputValue(input, "tank_2");
    });
    await click(container.querySelector('[data-testid="entity-rename-apply"]'));

    const dialog = container.querySelector('[data-testid="rename-confirm-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain("tank_1");
    expect(dialog.textContent).toContain("tank_2");
    const affected = dialog.querySelector('[data-testid="rename-affected-blocks"]');
    expect(affected.textContent).toContain("Нарезка");
    expect(affected.textContent).toContain("container_ref");

    await click(dialog.querySelector('[data-testid="rename-confirm"]'));
    expect(container.querySelector('[data-entity-ref="tank_2"]')).toBeTruthy();
    expect(container.querySelector('[data-entity-ref="tank_1"]')).toBe(null);

    // block param now references the new ref
    await selectNode(container, "Task_1");
    await act(async () => {});
    expect(container.querySelector('[data-testid="param-container_ref"]').value).toBe("tank_2");

    // pure helper semantics
    const renamed = renameEntityRef(normalizeUiModel(makeModel()), "containers", "tank_1", "tank_2");
    expect(renamed.process_entities.containers.tank_2).toBeTruthy();
    expect(renamed.process_entities.containers.tank_1).toBeUndefined();
    expect(renamed.nodes.find((n) => n.id === "Task_1").params.container_ref).toBe("tank_2");
  });

  it("reachability check marks unreached node with warning badge", async () => {
    setHandoff(makeModel());
    setLocation("/technologist/constructor?from=import");
    const { container } = await renderConstructor();

    await click(container.querySelector('[data-testid="check-reachability"]'));
    const notice = container.querySelector('[data-testid="ctor-notice"]');
    expect(notice.textContent).toContain("Сирота");

    const orphan = container.querySelector('.graph-canvas__node[data-element-id="Task_orphan"]');
    expect(orphan.querySelector(".graph-canvas__warning")).toBeTruthy();
    const reached = container.querySelector('.graph-canvas__node[data-element-id="Task_2"]');
    expect(reached.querySelector(".graph-canvas__warning")).toBe(null);

    // pure helper
    const { unreachable } = computeReachable(normalizeUiModel(makeModel()));
    expect(unreachable).toEqual(["Task_orphan"]);
  });

  it("save flow: POST called for new template with ui_model payload", async () => {
    setHandoff(makeModel());
    setLocation("/technologist/constructor?from=import");
    const { container } = await renderConstructor();

    await click(container.querySelector('[data-testid="template-save"]'));
    await act(async () => {});

    const postCall = fetch.mock.calls.find(
      ([url, init]) => String(url).includes("/api/process-templates") && String(init?.method || "").toUpperCase() === "POST",
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse(String(postCall[1].body));
    expect(body.status).toBe("draft");
    expect(body.name).toBe("Импортированный шаблон");
    expect(Array.isArray(body.ui_model.nodes)).toBe(true);
    expect(body.ui_model.nodes.length).toBe(5);
    expect(body.ui_model.process_entities.containers.tank_1).toBeTruthy();
    // after POST the editor switches to the created id
    expect(container.querySelector('[data-testid="version-label"]').textContent).toContain("tpl_new");
  });

  it("save flow: PUT called for existing template (?template=<id>)", async () => {
    setLocation("/technologist/constructor?template=tpl_1");
    const { container } = await renderConstructor();
    await act(async () => {});
    expect(container.querySelector('[data-testid="version-label"]').textContent).toContain("tpl_1");

    await click(container.querySelector('[data-testid="template-save"]'));
    await act(async () => {});

    const putCall = fetch.mock.calls.find(
      ([url, init]) => String(url).includes("/api/process-templates/tpl_1") && String(init?.method || "").toUpperCase() === "PUT",
    );
    expect(putCall).toBeTruthy();
    const body = JSON.parse(String(putCall[1].body));
    expect(body.name).toBe("Существующий шаблон");
    expect(body.version).toBe("0.2.0");
    expect(body.ui_model.nodes.length).toBe(5);
    const postCall = fetch.mock.calls.find(
      ([url, init]) => String(url).includes("/api/process-templates") && String(init?.method || "").toUpperCase() === "POST",
    );
    expect(postCall).toBeUndefined();
  });

  it("connect mode: source→target creates a flow; add block from catalog palette", async () => {
    setLocation("/technologist/constructor");
    const { container } = await renderConstructor();
    await act(async () => {}); // catalog load

    await click(container.querySelector('[data-testid="palette-add-cut"]'));
    await click(container.querySelector('[data-testid="palette-startEvent"]'));
    expect(container.querySelectorAll(".graph-canvas__node").length).toBe(2);

    await click(container.querySelector('[data-testid="connect-toggle"]'));
    expect(container.querySelector('[data-testid="connect-hint"]').textContent).toContain("источник");
    await selectNode(container, "StartEvent_1");
    expect(container.querySelector('[data-testid="connect-hint"]').textContent).toContain("целевой");
    await selectNode(container, "Task_1");

    expect(container.querySelectorAll("polyline").length).toBe(1);
    const flowForm = container.querySelector('[data-testid="flow-form"]');
    expect(flowForm).toBeTruthy();
  });
});
