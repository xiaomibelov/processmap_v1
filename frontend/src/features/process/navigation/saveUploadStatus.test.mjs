import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSaveUploadStatusBadge,
  normalizeBpmnSaveLifecycleEvent,
} from "./saveUploadStatus.js";

test("normalize lifecycle maps persist start to uploading stage with xml bytes", () => {
  const event = normalizeBpmnSaveLifecycleEvent({
    event: "SAVE_PERSIST_STARTED",
    payload: {
      sid: "sid_1",
      reason: "manual_save",
      xml_len: 3 * 1024 * 1024,
    },
  });

  assert.equal(event.stage, "uploading");
  assert.equal(event.sessionId, "sid_1");
  assert.equal(event.xmlBytes, 3 * 1024 * 1024);
});

test("badge displays truthful uploading text with payload size", () => {
  const badge = buildSaveUploadStatusBadge({
    stage: "uploading",
    xmlBytes: 3 * 1024 * 1024,
  });

  assert.equal(badge.visible, true);
  assert.equal(badge.tone, "warn");
  assert.match(badge.label, /3.0 MB/);
});

test("badge explains unchanged skip without fake upload progress", () => {
  const badge = buildSaveUploadStatusBadge({
    stage: "skipped_unchanged",
  });

  assert.equal(badge.visible, true);
  assert.equal(badge.tone, "ok");
  assert.match(badge.label, /без изменений/i);
});

test("badge shows failed status with http code when available", () => {
  const badge = buildSaveUploadStatusBadge({
    stage: "failed",
    status: 409,
    error: "revision conflict",
  });

  assert.equal(badge.visible, true);
  assert.equal(badge.tone, "err");
  assert.match(badge.label, /HTTP 409/);
  assert.match(badge.title, /conflict/i);
});

test("normalize maps 409 conflict payload object to explicit conflict stage", () => {
  const event = normalizeBpmnSaveLifecycleEvent({
    event: "SAVE_PERSIST_FAIL",
    payload: {
      sid: "sid_conflict",
      status: 409,
      error_code: "http_409",
      error_details: {
        code: "DIAGRAM_STATE_CONFLICT",
        session_id: "sid_conflict",
        client_base_version: 12,
        server_current_version: 13,
        server_last_write: {
          actor_label: "Иван",
          at: 1776147496,
          changed_keys: ["bpmn_xml", "bpmn_meta"],
        },
      },
      error: { detail: "stale write blocked" },
    },
  });

  assert.equal(event.stage, "conflict");
  assert.equal(event.state, "conflict");
  assert.equal(event.conflict?.code, "DIAGRAM_STATE_CONFLICT");
  assert.equal(event.conflict?.clientBaseVersion, 12);
  assert.equal(event.conflict?.serverCurrentVersion, 13);
  assert.equal(event.conflict?.actorLabel, "Иван");
});

test("conflict badge renders readable context and never shows [object Object]", () => {
  const badge = buildSaveUploadStatusBadge({
    stage: "conflict",
    status: 409,
    error: { detail: { code: "DIAGRAM_STATE_CONFLICT" } },
    conflict: {
      code: "DIAGRAM_STATE_CONFLICT",
      clientBaseVersion: 345,
      serverCurrentVersion: 349,
      actorLabel: "Мария",
      at: 1776147496,
      changedKeys: ["bpmn_xml", "nodes"],
    },
  });

  assert.equal(badge.visible, true);
  assert.equal(badge.state, "conflict");
  assert.match(badge.label, /конфликт сохранения/i);
  assert.equal(String(badge.title).includes("[object Object]"), false);
  assert.match(badge.title, /Мария/);
  assert.match(badge.title, /bpmn_xml/);
});

test("conflict badge preserves zero server version instead of replacing it with unknown marker", () => {
  const badge = buildSaveUploadStatusBadge({
    stage: "conflict",
    status: 409,
    conflict: {
      code: "DIAGRAM_STATE_CONFLICT",
      clientBaseVersion: 1,
      serverCurrentVersion: 0,
      actorLabel: "",
      at: 0,
      changedKeys: [],
    },
  });

  assert.equal(badge.visible, true);
  assert.match(badge.title, /Серверная версия:\s*0\./);
  assert.match(badge.title, /Ваша базовая:\s*1\./);
});
