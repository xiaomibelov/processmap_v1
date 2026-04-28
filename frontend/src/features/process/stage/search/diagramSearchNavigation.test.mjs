import assert from "node:assert/strict";
import test from "node:test";

import { navigateDiagramSearchResult, __test__ } from "./diagramSearchNavigation.js";

function createBpmnRef({
  selectableIds = [],
  focusableIds = [],
  openInsideOk = true,
} = {}) {
  const calls = [];
  const selectable = new Set(selectableIds);
  const focusable = new Set(focusableIds);
  return {
    calls,
    ref: {
      current: {
        whenReady: async () => {
          calls.push({ type: "whenReady" });
          return true;
        },
        selectElements: (ids, options) => {
          calls.push({ type: "selectElements", ids, options });
          const foundIds = ids.filter((id) => selectable.has(id));
          if (!foundIds.length) return { ok: false, error: "elements_not_found", ids };
          return { ok: true, ids: foundIds, count: foundIds.length };
        },
        focusNode: (id, options) => {
          calls.push({ type: "focusNode", id, options });
          return focusable.has(id);
        },
        runDiagramContextAction: async (payload) => {
          calls.push({ type: "runDiagramContextAction", payload });
          if (!openInsideOk) return { ok: false, error: "open_inside_failed" };
          return {
            ok: true,
            openInsidePreview: {
              targetId: payload?.target?.id,
              title: "Подпроцесс",
            },
          };
        },
      },
    },
  };
}

test("navigateDiagramSearchResult keeps ordinary element focus on existing request path", async () => {
  const focusCalls = [];
  const result = await navigateDiagramSearchResult(
    { elementId: "Task_Main", name: "Main" },
    {
      requestDiagramFocus: (elementId, options) => {
        focusCalls.push({ elementId, options });
        return true;
      },
      source: "diagram_search_row",
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.mode, "ordinary_focus_request");
  assert.deepEqual(focusCalls, [
    {
      elementId: "Task_Main",
      options: {
        source: "diagram_search_row",
        clearExistingSelection: true,
        centerInViewport: true,
      },
    },
  ]);
});

test("navigateDiagramSearchResult focuses property owner element through ordinary path", async () => {
  const focusCalls = [];
  await navigateDiagramSearchResult(
    { elementId: "Task_Owner", propertyName: "sla", propertyValue: "2 hours" },
    {
      requestDiagramFocus: (elementId, options) => {
        focusCalls.push({ elementId, options });
        return true;
      },
      source: "diagram_search_next",
    },
  );

  assert.equal(focusCalls[0]?.elementId, "Task_Owner");
  assert.equal(focusCalls[0]?.options?.source, "diagram_search_next");
});

test("navigateDiagramSearchResult focuses rendered subprocess child before using preview fallback", async () => {
  const { ref, calls } = createBpmnRef({
    selectableIds: ["Task_Child"],
    focusableIds: ["Task_Child"],
  });
  const previewCalls = [];

  const result = await navigateDiagramSearchResult(
    {
      elementId: "Task_Child",
      isInsideSubprocess: true,
      parentSubprocessId: "Sub_1",
      subprocessPath: [{ id: "Sub_1", name: "Проверить заказ" }],
    },
    {
      bpmnRef: ref,
      onSubprocessPreviewResult: (payload) => previewCalls.push(payload),
      source: "diagram_search_row",
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.mode, "subprocess_child_focus");
  assert.equal(result.childFocused, true);
  assert.equal(calls.some((call) => call.type === "runDiagramContextAction"), false);
  assert.equal(previewCalls.length, 0);
});

test("navigateDiagramSearchResult opens subprocess preview fallback when child is not rendered", async () => {
  const { ref, calls } = createBpmnRef({
    selectableIds: ["Sub_1"],
    focusableIds: ["Sub_1"],
  });
  const previewCalls = [];
  const infoMessages = [];

  const result = await navigateDiagramSearchResult(
    {
      elementId: "Task_Child",
      isInsideSubprocess: true,
      parentSubprocessId: "Sub_1",
      subprocessPath: [{ id: "Sub_1", name: "Проверить заказ" }],
    },
    {
      bpmnRef: ref,
      onSubprocessPreviewResult: (payload) => previewCalls.push(payload),
      setInfoMsg: (message) => infoMessages.push(message),
      source: "diagram_search_row",
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.mode, "subprocess_preview_fallback");
  assert.equal(result.childFocused, false);
  assert.equal(result.containerFocused, true);
  assert.equal(result.subprocessId, "Sub_1");
  assert.equal(previewCalls.length, 1);
  assert.equal(infoMessages.at(-1), "Элемент находится внутри subprocess. Открыт контекст subprocess.");
  assert.deepEqual(
    calls.find((call) => call.type === "runDiagramContextAction")?.payload?.target,
    { id: "Sub_1", kind: "element" },
  );
});

test("navigateDiagramSearchResult reports missing subprocess target without crashing", async () => {
  const { ref } = createBpmnRef({
    selectableIds: [],
    focusableIds: [],
    openInsideOk: false,
  });
  const errors = [];

  const result = await navigateDiagramSearchResult(
    {
      elementId: "Task_Missing",
      isInsideSubprocess: true,
      parentSubprocessId: "Sub_Missing",
      subprocessPath: [{ id: "Sub_Missing", name: "Missing" }],
    },
    {
      bpmnRef: ref,
      setGenErr: (message) => errors.push(message),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.mode, "subprocess_focus_failed");
  assert.equal(errors.at(-1), "Элемент больше не найден на схеме.");
});

test("navigateDiagramSearchResult suppresses stale async subprocess navigation", async () => {
  const { ref } = createBpmnRef({
    selectableIds: ["Task_Child"],
    focusableIds: ["Task_Child"],
  });
  let stale = false;
  ref.current.whenReady = async () => {
    stale = true;
    return true;
  };

  const result = await navigateDiagramSearchResult(
    {
      elementId: "Task_Child",
      isInsideSubprocess: true,
      parentSubprocessId: "Sub_1",
      subprocessPath: [{ id: "Sub_1", name: "Проверить заказ" }],
    },
    {
      bpmnRef: ref,
      isStale: () => stale,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.mode, "stale");
});

test("diagram search navigation identifies nested subprocess path from nearest to outer fallback order", () => {
  const ids = __test__.getSubprocessPathIds({
    subprocessPath: [
      { id: "Sub_A", name: "A" },
      { id: "Sub_B", name: "B" },
    ],
  });
  assert.deepEqual(ids, ["Sub_A", "Sub_B"]);
  assert.equal(__test__.isSubprocessSearchResult({ subprocessPath: [{ id: "Sub_A" }] }), true);
});
