import test from "node:test";
import assert from "node:assert/strict";

import {
  extractPublishGitMirrorSnapshot,
  getPublishGitMirrorMeta,
  normalizePublishGitMirrorState,
} from "./publishGitMirrorStatus.js";

test("normalizePublishGitMirrorState keeps supported publish-only states", () => {
  assert.equal(normalizePublishGitMirrorState("synced"), "synced");
  assert.equal(normalizePublishGitMirrorState("SKIPPED_INVALID_CONFIG"), "skipped_invalid_config");
  assert.equal(normalizePublishGitMirrorState("random"), "not_attempted");
});

test("extractPublishGitMirrorSnapshot reads top-level shaped payload", () => {
  const out = extractPublishGitMirrorSnapshot({
    publish_git_mirror_state: "pending",
    publish_git_mirror_version_number: 4,
    publish_git_mirror_version_id: "v004",
    publish_git_mirror_last_error: "",
  });
  assert.equal(out.state, "pending");
  assert.equal(out.versionNumber, 4);
  assert.equal(out.versionId, "v004");
});

test("extractPublishGitMirrorSnapshot reads legacy nested current_bpmn payload", () => {
  const out = extractPublishGitMirrorSnapshot({
    mirror_state: "synced",
    current_bpmn: {
      version_number: 2,
      version_id: "v002",
    },
    last_error: "none",
  });
  assert.equal(out.state, "synced");
  assert.equal(out.versionNumber, 2);
  assert.equal(out.versionId, "v002");
  assert.equal(out.lastError, "none");
});

test("getPublishGitMirrorMeta keeps states distinct", () => {
  assert.equal(getPublishGitMirrorMeta("skipped_disabled").label, "Выключен в организации");
  assert.equal(getPublishGitMirrorMeta("skipped_invalid_config").label, "Неверная конфигурация");
  assert.equal(getPublishGitMirrorMeta("failed").label, "Ошибка синка");
});

