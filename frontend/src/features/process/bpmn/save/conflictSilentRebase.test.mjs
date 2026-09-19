// Unit-матрица overlap-детектора silent self-rebase (fix/self-conflict-silent-rebase).
// Контракт (override пользователя): silent rebase ТОЛЬКО при полной
// определённости — changed_keys присутствуют, НЕПУСТЫ и НЕ пересекаются с
// локальными dirty-ключами. Пустые/отсутствующие/неизвестные → модал
// (классификация "unknown"), НЕ retry. Сомнение всегда в сторону модала.

import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyRebaseSafety,
  diagramTruthKeysFromPatch,
  extractConflictDetail,
  RAW_XML_WRITE_KEYS,
} from "./conflictSilentRebase.js";

test("interview (сервер) vs bpmn_xml/bpmn_meta (локальный PUT) → disjoint", () => {
  assert.equal(
    classifyRebaseSafety({ serverChangedKeys: ["interview"], localDirtyKeys: RAW_XML_WRITE_KEYS }),
    "disjoint",
  );
});

test("пересечение bpmn_xml → overlap", () => {
  assert.equal(
    classifyRebaseSafety({ serverChangedKeys: ["bpmn_xml"], localDirtyKeys: RAW_XML_WRITE_KEYS }),
    "overlap",
  );
});

test("пересечение bpmn_meta → overlap", () => {
  assert.equal(
    classifyRebaseSafety({ serverChangedKeys: ["interview", "bpmn_meta"], localDirtyKeys: RAW_XML_WRITE_KEYS }),
    "overlap",
  );
});

test("пустые changed_keys → unknown (модал, НЕ retry)", () => {
  assert.equal(classifyRebaseSafety({ serverChangedKeys: [], localDirtyKeys: RAW_XML_WRITE_KEYS }), "unknown");
});

test("отсутствующие changed_keys (null/undefined/не массив) → unknown", () => {
  for (const serverChangedKeys of [null, undefined, "interview", 42, {}]) {
    assert.equal(
      classifyRebaseSafety({ serverChangedKeys, localDirtyKeys: RAW_XML_WRITE_KEYS }),
      "unknown",
      `serverChangedKeys=${String(serverChangedKeys)}`,
    );
  }
});

test("неизвестный серверный ключ → unknown (сомнение → модал)", () => {
  for (const key of ["roles", "mystery", "title"]) {
    assert.equal(
      classifyRebaseSafety({ serverChangedKeys: ["interview", key], localDirtyKeys: RAW_XML_WRITE_KEYS }),
      "unknown",
      `ключ ${key}`,
    );
  }
});

test("пустой/невалидный localDirtyKeys → unknown", () => {
  for (const localDirtyKeys of [[], null, undefined, "bpmn_xml", ["mystery-local"]]) {
    assert.equal(
      classifyRebaseSafety({ serverChangedKeys: ["interview"], localDirtyKeys }),
      "unknown",
      `localDirtyKeys=${JSON.stringify(localDirtyKeys)}`,
    );
  }
});

test("meta vs meta (interview vs interview) → overlap", () => {
  assert.equal(
    classifyRebaseSafety({ serverChangedKeys: ["interview"], localDirtyKeys: ["interview"] }),
    "overlap",
  );
});

test("meta (questions) vs bpmn_xml (сервер) → disjoint", () => {
  assert.equal(
    classifyRebaseSafety({ serverChangedKeys: ["bpmn_xml"], localDirtyKeys: ["questions", "interview"] }),
    "disjoint",
  );
});

test("nodes/edges кросс-кейсы", () => {
  assert.equal(
    classifyRebaseSafety({ serverChangedKeys: ["nodes"], localDirtyKeys: ["interview"] }),
    "disjoint",
  );
  assert.equal(
    classifyRebaseSafety({ serverChangedKeys: ["nodes", "edges"], localDirtyKeys: ["nodes"] }),
    "overlap",
  );
});

test("diagramTruthKeysFromPatch: только diagram-truth ключи, unknown пропускаются", () => {
  assert.deepEqual(
    diagramTruthKeysFromPatch({ interview: {}, title: "x", bpmn_meta: {}, mystery: 1 }),
    ["bpmn_meta", "interview"],
  );
  assert.deepEqual(diagramTruthKeysFromPatch({ title: "x" }), []);
  assert.deepEqual(diagramTruthKeysFromPatch(null), []);
});

test("extractConflictDetail: парсит server_version + last_write", () => {
  const detail = extractConflictDetail({
    data: {
      detail: {
        code: "DIAGRAM_STATE_CONFLICT",
        server_current_version: 33,
        server_last_write: {
          actor_user_id: "u1",
          actor_label: "User One",
          client_id: "cid-1",
          at: 1789779940,
          changed_keys: ["interview"],
        },
      },
    },
  });
  assert.equal(detail.serverVersion, 33);
  assert.deepEqual(detail.changedKeys, ["interview"]);
  assert.equal(detail.clientId, "cid-1");
  assert.equal(detail.actorLabel, "User One");
});

test("extractConflictDetail: верхнеуровневые алиасы тоже парсятся", () => {
  const detail = extractConflictDetail({
    server_current_version: 7,
    server_last_write: { changed_keys: ["bpmn_xml"] },
  });
  assert.equal(detail.serverVersion, 7);
  assert.deepEqual(detail.changedKeys, ["bpmn_xml"]);
});

test("extractConflictDetail: отсутствует server_current_version → null", () => {
  assert.equal(extractConflictDetail({ data: { detail: { code: "X" } } }), null);
  assert.equal(extractConflictDetail(null), null);
});
