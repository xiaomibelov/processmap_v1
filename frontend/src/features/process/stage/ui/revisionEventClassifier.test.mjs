import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyRevisionEventAction,
  localizeRevisionEventAction,
  normalizeRevisionEventAction,
} from "./revisionEventClassifier.js";

test("meaningful action is allowed in all user-facing version surfaces", () => {
  const classified = classifyRevisionEventAction("publish_manual_save");
  assert.equal(classified.bucket, "meaningful");
  assert.equal(classified.known, true);
  assert.equal(classified.actionKind, "publish");
  assert.equal(classified.allowInPublishedBadge, true);
  assert.equal(classified.allowInRevisionHistory, true);
  assert.equal(classified.allowInFileVersions, true);
});

test("technical action is filtered from user-facing version surfaces", () => {
  const classified = classifyRevisionEventAction("manual_save");
  assert.equal(classified.bucket, "technical");
  assert.equal(classified.known, true);
  assert.equal(classified.actionKind, "save_runtime");
  assert.equal(classified.allowInPublishedBadge, false);
  assert.equal(classified.allowInRevisionHistory, false);
  assert.equal(classified.allowInFileVersions, false);
});

test("unknown action is fail-closed by default", () => {
  const classified = classifyRevisionEventAction("custom_domain_action");
  assert.equal(classified.bucket, "unknown");
  assert.equal(classified.known, false);
  assert.equal(classified.actionKind, "unknown");
  assert.equal(classified.allowInPublishedBadge, false);
  assert.equal(classified.allowInRevisionHistory, false);
  assert.equal(classified.allowInFileVersions, false);
});

test("normalization/localization use shared taxonomy", () => {
  assert.equal(normalizeRevisionEventAction(" Publish_Manual_Save "), "publish_manual_save");
  assert.equal(localizeRevisionEventAction("publish_manual_save"), "Ручная публикация");
  assert.equal(localizeRevisionEventAction("manual_save"), "Техническое сохранение");
});
