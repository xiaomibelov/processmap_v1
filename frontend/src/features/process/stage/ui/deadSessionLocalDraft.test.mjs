import test from "node:test";
import assert from "node:assert/strict";

import { readDeadSessionLocalDraft } from "./deadSessionLocalDraft.js";

function makeStorage(map = {}) {
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null),
  };
}

test("dead session draft: runtime cache свежий → источник runtime_cache", () => {
  const storage = makeStorage({
    "fpc_bpmn_runtime_cache:s1": JSON.stringify({ xml: "<xml>cached</xml>", ts: Date.now() }),
  });
  const draft = readDeadSessionLocalDraft({ sessionId: "s1", storage });
  assert.equal(draft?.source, "runtime_cache");
  assert.equal(draft?.xml, "<xml>cached</xml>");
});

test("dead session draft: протухший runtime cache (>24ч) игнорируется, fallback на fpc_bpmn_xml_", () => {
  const storage = makeStorage({
    "fpc_bpmn_runtime_cache:s1": JSON.stringify({ xml: "<xml>old</xml>", ts: Date.now() - 25 * 60 * 60 * 1000 }),
    "fpc_bpmn_xml_s1": "<xml>local</xml>",
  });
  const draft = readDeadSessionLocalDraft({ sessionId: "s1", storage });
  assert.equal(draft?.source, "local_xml");
  assert.equal(draft?.xml, "<xml>local</xml>");
});

test("dead session draft: битый JSON кэша не роняет чтение, fallback на fpc_bpmn_xml_", () => {
  const storage = makeStorage({
    "fpc_bpmn_runtime_cache:s1": "{not-json",
    "fpc_bpmn_xml_s1": "<xml>local</xml>",
  });
  const draft = readDeadSessionLocalDraft({ sessionId: "s1", storage });
  assert.equal(draft?.source, "local_xml");
});

test("dead session draft: приоритет runtime cache над fpc_bpmn_xml_", () => {
  const storage = makeStorage({
    "fpc_bpmn_runtime_cache:s1": JSON.stringify({ xml: "<xml>cached</xml>", ts: Date.now() }),
    "fpc_bpmn_xml_s1": "<xml>local</xml>",
  });
  const draft = readDeadSessionLocalDraft({ sessionId: "s1", storage });
  assert.equal(draft?.source, "runtime_cache");
});

test("dead session draft: ничего нет → null; пустой sid → null; без storage → null", () => {
  assert.equal(readDeadSessionLocalDraft({ sessionId: "s1", storage: makeStorage({}) }), null);
  assert.equal(readDeadSessionLocalDraft({ sessionId: "", storage: makeStorage({}) }), null);
  assert.equal(readDeadSessionLocalDraft({ sessionId: "s1", storage: null }), null);
});
