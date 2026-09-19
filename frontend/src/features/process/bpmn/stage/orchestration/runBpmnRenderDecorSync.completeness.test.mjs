// Срез fix/canvas-overlays-preferences-409 (F1) — полнота decor-set:
// applyFullBpmnDecorSet обязан включать properties-overlay decor (legacy
// property cards), иначе после remote sync есть окно пропадания карточек
// (audit H3: восстанавливались лишь отложенным fanout postStagingFanout).

import assert from "node:assert/strict";
import test from "node:test";

import { applyFullBpmnDecorSet } from "./runBpmnRenderDecorSync.js";

test("applyFullBpmnDecorSet applies properties overlay decor", () => {
  const calls = [];
  const record = (name) => (inst, kind) => calls.push(`${name}:${kind}`);
  applyFullBpmnDecorSet({
    inst: { id: "inst_1" },
    kind: "editor",
    applyTaskTypeDecor: record("taskType"),
    applyLinkEventDecor: record("linkEvent"),
    applyHappyFlowDecor: record("happyFlow"),
    applyRobotMetaDecor: record("robotMeta"),
    applyBottleneckDecor: record("bottleneck"),
    applyInterviewDecor: record("interview"),
    applyUserNotesDecor: record("userNotes"),
    applyStepTimeDecor: record("stepTime"),
    applySubprocessDiscussionDecor: record("subprocessDiscussion"),
    applyPropertiesOverlayDecor: record("propertiesOverlay"),
  });
  assert.ok(calls.includes("propertiesOverlay:editor"), `properties overlay decor must be in the full set, got: ${calls.join(",")}`);
});

test("applyFullBpmnDecorSet keeps working when properties overlay decor is not provided", () => {
  const calls = [];
  const record = (name) => (inst, kind) => calls.push(`${name}:${kind}`);
  assert.doesNotThrow(() => applyFullBpmnDecorSet({
    inst: { id: "inst_1" },
    kind: "viewer",
    applyTaskTypeDecor: record("taskType"),
    applyLinkEventDecor: record("linkEvent"),
    applyHappyFlowDecor: record("happyFlow"),
    applyRobotMetaDecor: record("robotMeta"),
    applyBottleneckDecor: record("bottleneck"),
    applyInterviewDecor: record("interview"),
    applyUserNotesDecor: record("userNotes"),
    applyStepTimeDecor: record("stepTime"),
  }));
  assert.ok(calls.includes("taskType:viewer"));
});
