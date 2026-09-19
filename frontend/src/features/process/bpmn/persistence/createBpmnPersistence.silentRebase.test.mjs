// fix/self-conflict-silent-rebase: pipeline-уровень silent self-rebase
// rawXml (full-PUT). Контракт:
//   - disjoint changed_keys → ровно ОДИН retry-transport с base=serverVersion,
//     ok + adopt серверной версии;
//   - overlap/пустые/отсутствующие/неизвестные changed_keys → null (модал);
//   - повторный вызов с той же serverVersion → null (бюджет 0–1, защита от
//     409-лупы);
//   - retry-transport вернул ошибку → null (модал).

import test from "node:test";
import assert from "node:assert/strict";

import { createRawXmlPipelineConfig } from "./createBpmnPersistence.js";

function conflictResponse({ serverVersion = 33, changedKeys = ["interview"] } = {}) {
  return {
    ok: false,
    status: 409,
    error: "DIAGRAM_STATE_CONFLICT",
    data: {
      detail: {
        code: "DIAGRAM_STATE_CONFLICT",
        server_current_version: serverVersion,
        server_last_write: {
          actor_user_id: "u1",
          actor_label: "User One",
          client_id: "meta-cid",
          at: 1789779940,
          changed_keys: changedKeys,
        },
      },
    },
  };
}

function makePayload({ putResults } = {}) {
  const calls = [];
  let idx = 0;
  const apiPutBpmnXml = async (sid, xml, options) => {
    calls.push({ sid, xml, options });
    const result = putResults[Math.min(idx, putResults.length - 1)];
    idx += 1;
    return result;
  };
  return {
    calls,
    payload: {
      xml: "<bpmn:definitions/>",
      options: { rev: 4, baseDiagramStateVersion: 32 },
      apiPutBpmnXml,
    },
  };
}

test("disjoint (interview) → один retry с base=serverVersion, ok + adopt", async () => {
  const config = createRawXmlPipelineConfig();
  const { calls, payload } = makePayload({
    putResults: [{ ok: true, status: 200, diagram_state_version: 33 }],
  });

  const result = await config.trySilentRebase(conflictResponse(), "s-raw-1", payload);
  assert.equal(result.ok, true);
  assert.equal(result.diagramStateVersion, 33);
  assert.equal(calls.length, 1, "ровно один silent retry");
  assert.equal(calls[0].options.baseDiagramStateVersion, 33, "retry с базой из 409-снапшота");
  assert.equal(calls[0].sid, "s-raw-1");
});

test("overlap (bpmn_xml) → null, transport не дёргается", async () => {
  const config = createRawXmlPipelineConfig();
  const { calls, payload } = makePayload({ putResults: [{ ok: true }] });

  const result = await config.trySilentRebase(
    conflictResponse({ changedKeys: ["bpmn_xml"] }),
    "s-raw-2",
    payload,
  );
  assert.equal(result, null);
  assert.equal(calls.length, 0);
});

test("пустые changed_keys → null (сомнение → модал, НЕ retry)", async () => {
  const config = createRawXmlPipelineConfig();
  const { calls, payload } = makePayload({ putResults: [{ ok: true }] });

  assert.equal(await config.trySilentRebase(conflictResponse({ changedKeys: [] }), "s-raw-3", payload), null);
  assert.equal(await config.trySilentRebase(
    conflictResponse({ changedKeys: null }),
    "s-raw-3b",
    payload,
  ), null);
  assert.equal(calls.length, 0);
});

test("неизвестный серверный ключ → null", async () => {
  const config = createRawXmlPipelineConfig();
  const { calls, payload } = makePayload({ putResults: [{ ok: true }] });

  const result = await config.trySilentRebase(
    conflictResponse({ changedKeys: ["interview", "mystery"] }),
    "s-raw-4",
    payload,
  );
  assert.equal(result, null);
  assert.equal(calls.length, 0);
});

test("бюджет: повторный вызов с той же serverVersion → null (без retry)", async () => {
  const config = createRawXmlPipelineConfig();
  const { calls, payload } = makePayload({
    putResults: [{ ok: true, status: 200, diagram_state_version: 33 }],
  });
  const response = conflictResponse();

  const first = await config.trySilentRebase(response, "s-raw-5", payload);
  assert.equal(first.ok, true);
  const second = await config.trySilentRebase(response, "s-raw-5", payload);
  assert.equal(second, null, "второй 409 той же версии → модал");
  assert.equal(calls.length, 1, "transport вызван ровно один раз");
});

test("новый конфликт (другая serverVersion) → retry снова разрешён", async () => {
  const config = createRawXmlPipelineConfig();
  const { calls, payload } = makePayload({
    putResults: [
      { ok: true, status: 200, diagram_state_version: 33 },
      { ok: true, status: 200, diagram_state_version: 35 },
    ],
  });

  await config.trySilentRebase(conflictResponse({ serverVersion: 33 }), "s-raw-6", payload);
  const second = await config.trySilentRebase(conflictResponse({ serverVersion: 35 }), "s-raw-6", payload);
  assert.equal(second.ok, true);
  assert.equal(second.diagramStateVersion, 35);
  assert.equal(calls.length, 2);
});

test("retry-transport вернул ошибку → null (модал)", async () => {
  const config = createRawXmlPipelineConfig();
  const { payload } = makePayload({ putResults: [{ ok: false, status: 409 }] });

  const result = await config.trySilentRebase(conflictResponse(), "s-raw-7", payload);
  assert.equal(result, null);
});

test("бюджет чистится при модале: overlap-409 освобождает запись (NIT-1)", async () => {
  const config = createRawXmlPipelineConfig();
  const { calls, payload } = makePayload({
    putResults: [
      { ok: true, status: 200, diagram_state_version: 33 },
      { ok: true, status: 200, diagram_state_version: 33 },
    ],
  });

  // 1) silent rebase на v33 — retry выполнен.
  const first = await config.trySilentRebase(conflictResponse(), "s-raw-8", payload);
  assert.equal(first.ok, true);
  // 2) повторный disjoint 409 той же v33 → бюджет исчерпан → null.
  const second = await config.trySilentRebase(conflictResponse(), "s-raw-8", payload);
  assert.equal(second, null);
  // 3) overlap-409 (модал) → запись бюджета удалена.
  const modal = await config.trySilentRebase(
    conflictResponse({ changedKeys: ["bpmn_xml"] }),
    "s-raw-8",
    payload,
  );
  assert.equal(modal, null);
  // 4) новый disjoint 409 v33 → retry снова разрешён (конфликт новый).
  const third = await config.trySilentRebase(conflictResponse(), "s-raw-8", payload);
  assert.equal(third.ok, true);
  assert.equal(calls.length, 2);
});

test("переопределение через overrides сохраняется совместимым", () => {
  const custom = async () => ({ ok: true });
  const config = createRawXmlPipelineConfig({ trySilentRebase: custom });
  assert.equal(config.trySilentRebase, custom);
});
