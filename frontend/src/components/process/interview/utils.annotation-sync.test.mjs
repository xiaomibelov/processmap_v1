import test from "node:test";
import assert from "node:assert/strict";

import { buildAnnotationSyncByStepId } from "./utils.js";

test("annotation sync: pending -> synced by exact xml note", () => {
  const step = {
    id: "step_1",
    node_bind_id: "Activity_1",
    comment: "Проверить температуру",
  };

  const pending = buildAnnotationSyncByStepId([step], {});
  assert.equal(pending.step_1.status, "pending");
  assert.equal(pending.step_1.label, "ожидает синхронизацию");

  const synced = buildAnnotationSyncByStepId([step], {
    Activity_1: ["Проверить температуру"],
  });
  assert.equal(synced.step_1.status, "synced");
  assert.equal(synced.step_1.label, "в BPMN/XML добавлено");
});

test("annotation sync: synced when xml has manual part (without AI block)", () => {
  const step = {
    id: "step_2",
    node_bind_id: "Activity_2",
    comment: "Ручной комментарий\n\n[AI_QUESTIONS]\n- Уточнить время\n[/AI_QUESTIONS]",
  };

  const sync = buildAnnotationSyncByStepId([step], {
    Activity_2: ["Ручной комментарий"],
  });
  assert.equal(sync.step_2.status, "synced");
});

test("annotation sync: mismatch when xml note exists but text is different", () => {
  const step = {
    id: "step_3",
    node_bind_id: "Activity_3",
    comment: "Текст A",
  };
  const sync = buildAnnotationSyncByStepId([step], {
    Activity_3: ["Текст B"],
  });
  assert.equal(sync.step_3.status, "mismatch");
  assert.equal(sync.step_3.label, "в BPMN другой текст");
});

test("annotation sync: missing node and empty comment states", () => {
  const withCommentNoNode = buildAnnotationSyncByStepId(
    [{ id: "step_4", node_bind_id: "", comment: "Есть комментарий" }],
    {},
  );
  assert.equal(withCommentNoNode.step_4.status, "missing_node");

  const emptyComment = buildAnnotationSyncByStepId(
    [{ id: "step_5", node_bind_id: "Activity_5", comment: "" }],
    { Activity_5: ["anything"] },
  );
  assert.equal(emptyComment.step_5.status, "empty");
});
