import test from "node:test";
import assert from "node:assert/strict";

import { buildBpmnFragmentGhost } from "../services/applyBpmnFragmentTemplatePlacement.js";
import {
  activateBpmnFragmentTemplatePlacement,
  buildCenteredBpmnFragmentPlacementDraft,
  insertBpmnFragmentFromPlacement,
  shouldCancelBpmnFragmentPlacementByKey,
} from "./useTemplatesStore.js";

test("activateBpmnFragmentTemplatePlacement: starts placement mode and closes picker", () => {
  const startCalls = [];
  const pickerCalls = [];
  const infoCalls = [];
  const errorCalls = [];
  const template = { id: "tpl_1", template_type: "bpmn_fragment_v1" };

  const result = activateBpmnFragmentTemplatePlacement({
    template,
    startBpmnFragmentPlacement: (templateArg) => {
      startCalls.push(templateArg);
      return { ok: true };
    },
    setPickerOpen: (value) => pickerCalls.push(value),
    setInfo: (value) => infoCalls.push(String(value || "")),
    setError: (value) => errorCalls.push(String(value || "")),
  });

  assert.equal(startCalls.length, 1);
  assert.equal(startCalls[0], template);
  assert.deepEqual(pickerCalls, [false]);
  assert.equal(errorCalls.length, 0);
  assert.equal(result?.ok, true);
  assert.equal(result?.placement, true);
  assert.match(infoCalls[0], /кликните ЛКМ/i);
});

test("activateBpmnFragmentTemplatePlacement: missing placement API fails contract", () => {
  const errorCalls = [];

  const result = activateBpmnFragmentTemplatePlacement({
    template: { id: "tpl_2", template_type: "bpmn_fragment_v1" },
    setError: (value) => errorCalls.push(String(value || "")),
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.error, "BPMN insert API недоступен.");
  assert.deepEqual(errorCalls, ["BPMN insert API недоступен."]);
});

test("activateBpmnFragmentTemplatePlacement: placement start failure does not close picker", () => {
  const pickerCalls = [];
  const infoCalls = [];
  const errorCalls = [];

  const result = activateBpmnFragmentTemplatePlacement({
    template: { id: "tpl_3", template_type: "bpmn_fragment_v1" },
    startBpmnFragmentPlacement: () => ({ ok: false, error: "invalid_pack" }),
    setPickerOpen: (value) => pickerCalls.push(value),
    setInfo: (value) => infoCalls.push(String(value || "")),
    setError: (value) => errorCalls.push(String(value || "")),
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.error, "invalid_pack");
  assert.deepEqual(pickerCalls, []);
  assert.deepEqual(infoCalls, []);
  assert.deepEqual(errorCalls, ["invalid_pack"]);
});

test("buildCenteredBpmnFragmentPlacementDraft: provides centered pointer and visible ghost before click", () => {
  const created = buildCenteredBpmnFragmentPlacementDraft(
    {
      id: "tpl_ghost",
      title: "Ghost",
      template_type: "bpmn_fragment_v1",
      pack: {
        fragment: {
          nodes: [
            { id: "A", type: "bpmn:Task", di: { x: 100, y: 100, w: 120, h: 80 } },
            { id: "B", type: "bpmn:Task", di: { x: 360, y: 220, w: 120, h: 80 } },
          ],
          edges: [
            { id: "F", sourceId: "A", targetId: "B" },
          ],
        },
      },
    },
    { left: 40, top: 50, width: 1000, height: 700 },
  );

  assert.equal(created?.ok, true);
  assert.equal(created?.draft?.pointer?.x, 540);
  assert.equal(created?.draft?.pointer?.y, 400);
  const ghost = buildBpmnFragmentGhost(created?.draft, {
    left: 40,
    top: 50,
    width: 1000,
    height: 700,
  });
  assert.ok(ghost);
  assert.equal(ghost.nodes, 2);
  assert.equal(ghost.edges, 1);
});

test("buildCenteredBpmnFragmentPlacementDraft: respects invalid template as non-startable placement", () => {
  const created = buildCenteredBpmnFragmentPlacementDraft(
    { id: "tpl_bad", template_type: "bpmn_fragment_v1" },
    { left: 0, top: 0, width: 800, height: 500 },
  );
  assert.equal(created?.ok, false);
});

test("insertBpmnFragmentFromPlacement: inserts by explicit left-click point payload", async () => {
  const calls = [];
  const result = await insertBpmnFragmentFromPlacement({
    currentPlacement: { template: { id: "tpl_click" } },
    clientX: 320,
    clientY: 240,
    insertBpmnFragmentTemplateAtPoint: async (draftArg, optionsArg) => {
      calls.push({ draftArg, optionsArg });
      return { ok: true, createdNodes: 3, createdEdges: 2 };
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.optionsArg?.clientX, 320);
  assert.equal(calls[0]?.optionsArg?.clientY, 240);
  assert.equal(calls[0]?.optionsArg?.mode, "after");
  assert.equal(calls[0]?.optionsArg?.persistImmediately, true);
  assert.equal(calls[0]?.optionsArg?.source, "template_apply");
});

test("insertBpmnFragmentFromPlacement: fails when insert API is missing", async () => {
  const result = await insertBpmnFragmentFromPlacement({
    currentPlacement: { template: { id: "tpl_missing_api" } },
    clientX: 10,
    clientY: 10,
  });
  assert.equal(result?.ok, false);
  assert.equal(result?.error, "BPMN insert API недоступен.");
});

test("insertBpmnFragmentFromPlacement: propagates explicit persist failure outcome", async () => {
  const result = await insertBpmnFragmentFromPlacement({
    currentPlacement: { template: { id: "tpl_persist_fail" } },
    clientX: 100,
    clientY: 80,
    insertBpmnFragmentTemplateAtPoint: async () => ({
      ok: false,
      error: "persist_failed",
    }),
  });
  assert.equal(result?.ok, false);
  assert.equal(result?.error, "persist_failed");
});

test("shouldCancelBpmnFragmentPlacementByKey: returns true only for Escape", () => {
  assert.equal(shouldCancelBpmnFragmentPlacementByKey({ key: "Escape" }), true);
  assert.equal(shouldCancelBpmnFragmentPlacementByKey({ key: "escape" }), true);
  assert.equal(shouldCancelBpmnFragmentPlacementByKey({ key: "Enter" }), false);
});
