import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyRevisionHistoryEvent,
  localizeRevisionHistoryEventAction,
  normalizeRevisionSourceAction,
} from "./revisionEventClassifier.js";

test("meaningful actions are explicitly allowed for published/history/version surfaces", () => {
  const result = classifyRevisionHistoryEvent("publish_manual_save");
  assert.equal(result.taxonomy, "meaningful");
  assert.equal(result.allowInPublishedBadge, true);
  assert.equal(result.allowInRevisionHistory, true);
  assert.equal(result.allowInFileVersions, true);
});

test("technical actions are excluded from published/history/version surfaces", () => {
  const result = classifyRevisionHistoryEvent("manual_save");
  assert.equal(result.taxonomy, "technical");
  assert.equal(result.allowInPublishedBadge, false);
  assert.equal(result.allowInRevisionHistory, false);
  assert.equal(result.allowInFileVersions, false);
});

test("unknown actions are fail-closed", () => {
  const result = classifyRevisionHistoryEvent("custom_domain_action");
  assert.equal(result.taxonomy, "unknown");
  assert.equal(result.isUnknown, true);
  assert.equal(result.allowInPublishedBadge, false);
  assert.equal(result.allowInRevisionHistory, false);
  assert.equal(result.allowInFileVersions, false);
  assert.equal(localizeRevisionHistoryEventAction("custom_domain_action"), "Неизвестное действие (custom_domain_action)");
});

test("normalization is stable for whitespace and case", () => {
  assert.equal(normalizeRevisionSourceAction("  Publish_Manual_Save "), "publish_manual_save");
});

