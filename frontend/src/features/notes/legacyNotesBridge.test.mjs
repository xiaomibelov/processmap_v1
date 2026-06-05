import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLegacyElementBridgeThread,
  injectLegacyBridgeThread,
} from "./legacyNotesBridge.js";

test("buildLegacyElementBridgeThread synthesizes selected-element legacy notes into read-only thread shape", () => {
  const thread = buildLegacyElementBridgeThread({
    elementId: "Task_1",
    elementName: "Согласовать заявку",
    elementType: "bpmn:Task",
    notesMap: {
      Task_1: {
        items: [
          {
            id: "legacy_note_1",
            text: "Проверить SLA",
            createdAt: 1710000000000,
            updatedAt: 1710000005000,
          },
        ],
        summary: "Локальный TL;DR",
        updatedAt: 1710000009000,
      },
    },
  });

  assert.equal(thread?.id, "legacy_element:Task_1");
  assert.equal(thread?.legacy_bridge, true);
  assert.equal(thread?.scope_type, "diagram_element");
  assert.equal(thread?.scope_ref?.element_id, "Task_1");
  assert.equal(thread?.scope_ref?.element_name, "Согласовать заявку");
  assert.equal(thread?.legacy_summary, "Локальный TL;DR");
  assert.equal(thread?.legacy_count, 1);
  assert.equal(thread?.comments?.length, 1);
  assert.equal(thread?.comments?.[0]?.body, "Проверить SLA");
  assert.equal(thread?.comments?.[0]?.author_user_id, "Legacy");
});

test("buildLegacyElementBridgeThread preserves author fields from legacy note items", () => {
  const thread = buildLegacyElementBridgeThread({
    elementId: "Task_2",
    elementName: "Утвердить",
    notesMap: {
      Task_2: {
        items: [
          {
            id: "legacy_note_2",
            text: "Согласовать с руководителем",
            author: "user_ivan",
            authorName: "Иван Петров",
            authorEmail: "ivan@example.test",
            createdAt: 1710000000000,
          },
        ],
        summary: "",
      },
    },
  });

  assert.equal(thread?.comments?.[0]?.author_user_id, "user_ivan");
  assert.equal(thread?.comments?.[0]?.author_full_name, "Иван Петров");
  assert.equal(thread?.comments?.[0]?.author_email, "ivan@example.test");
});

test("injectLegacyBridgeThread prepends bridge without mutating real thread list", () => {
  const realThreads = [{ id: "thread_1" }, { id: "thread_2" }];
  const bridgeThread = { id: "legacy_element:Task_1", legacy_bridge: true };

  const combined = injectLegacyBridgeThread(realThreads, bridgeThread);

  assert.deepEqual(realThreads, [{ id: "thread_1" }, { id: "thread_2" }]);
  assert.deepEqual(combined.map((item) => item.id), [
    "legacy_element:Task_1",
    "thread_1",
    "thread_2",
  ]);
});
