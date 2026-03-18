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
