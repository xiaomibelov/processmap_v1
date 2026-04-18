import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyRevisionSourceAction,
  formatRevisionAuthor,
  formatRevisionTimestampRu,
  localizeRevisionSourceAction,
  normalizeRevisionTimestampMs,
  resolveRevisionHistoryEmptyState,
  resolveRevisionHistoryUiSnapshot,
  splitMeaningfulAndTechnicalRevisions,
} from "./revisionHistoryUiModel.js";

test("normalizeRevisionTimestampMs converts unix seconds to milliseconds", () => {
  assert.equal(normalizeRevisionTimestampMs(1_710_000_000), 1_710_000_000_000);
  assert.equal(normalizeRevisionTimestampMs(1_710_000_000_123), 1_710_000_000_123);
});

test("formatRevisionTimestampRu renders real date and not 1970 for valid unix seconds", () => {
  const rendered = formatRevisionTimestampRu(1_710_000_000);
  assert.equal(rendered.includes("1970"), false);
  assert.notEqual(rendered, "—");
});

test("formatRevisionAuthor prefers human-readable fields and shortens technical ids", () => {
  const named = formatRevisionAuthor({
    display_name: "Дмитрий Белов",
    email: "d.belov@automacon.ru",
    id: "8f4b7f5fd3b146b4bf5160f8c0d9821a",
  });
  assert.equal(named.label, "Дмитрий Белов");

  const byEmail = formatRevisionAuthor({ email: "dev@example.com", id: "u_1" });
  assert.equal(byEmail.label, "dev@example.com");

  const shortTech = formatRevisionAuthor({ id: "8f4b7f5fd3b146b4bf5160f8c0d9821a" });
  assert.equal(shortTech.label.startsWith("Пользователь "), true);
});

test("resolveRevisionHistoryUiSnapshot uses latest version item as canonical revision number", () => {
  const resolved = resolveRevisionHistoryUiSnapshot({
    revisionHistorySnapshotRaw: {
      latestRevisionNumber: 1,
      latestRevisionId: "legacy_r1",
      draftState: { isDraftAheadOfLatestRevision: false },
    },
    latestVersionItemRaw: {
      id: "ver_6",
      revisionNumber: 6,
      source_action: "publish_manual_save",
    },
    latestVersionStatusRaw: "ready",
  });
  assert.equal(resolved.latestRevisionNumber, 6);
  assert.equal(resolved.latestRevisionId, "ver_6");
  assert.equal(resolved.latestPublishedRevisionNumber, 6);
  assert.equal(resolved.latestPublishedRevisionId, "ver_6");
  assert.equal(resolved.latestPublishedRevisionStatus, "ready");
  assert.equal(resolved.latestLedgerRevisionNumber, 1);
});

test("resolveRevisionHistoryUiSnapshot keeps companion ledger separate while authoritative head is still loading", () => {
  const resolved = resolveRevisionHistoryUiSnapshot({
    revisionHistorySnapshotRaw: {
      latestRevisionNumber: 41,
      latestRevisionId: "ledger_r41",
      draftState: { isDraftAheadOfLatestRevision: false },
    },
    latestVersionItemRaw: null,
    latestVersionStatusRaw: "loading",
  });
  assert.equal(resolved.latestRevisionNumber, 41);
  assert.equal(resolved.latestPublishedRevisionNumber, 0);
  assert.equal(resolved.latestPublishedRevisionStatus, "loading");
  assert.equal(resolved.latestPublishedRevisionResolved, false);
  assert.equal(resolved.latestLedgerRevisionNumber, 41);
  assert.equal(resolved.latestLedgerRevisionId, "ledger_r41");
});

test("resolveRevisionHistoryUiSnapshot applies fail-closed policy for unknown latest source action", () => {
  const resolved = resolveRevisionHistoryUiSnapshot({
    revisionHistorySnapshotRaw: {
      latestRevisionNumber: 5,
      latestRevisionId: "ledger_r5",
    },
    latestVersionItemRaw: {
      id: "ver_6",
      revisionNumber: 6,
      source_action: "custom_domain_action",
    },
    latestVersionStatusRaw: "ready",
  });
  assert.equal(resolved.latestPublishedRevisionNumber, 0);
  assert.equal(resolved.latestPublishedRevisionAllowed, false);
  assert.equal(resolved.latestPublishedRevisionTaxonomy, "unknown");
  assert.equal(resolved.latestRevisionNumber, 5);
});

test("classifyRevisionSourceAction separates meaningful and technical revisions by source_action", () => {
  const meaningful = classifyRevisionSourceAction("publish_manual_save");
  assert.equal(meaningful.isMeaningful, true);
  assert.equal(meaningful.isTechnical, false);
  assert.equal(meaningful.bucket, "meaningful");

  const technical = classifyRevisionSourceAction("manual_save");
  assert.equal(technical.isMeaningful, false);
  assert.equal(technical.isTechnical, true);
  assert.equal(technical.bucket, "technical");
});

test("splitMeaningfulAndTechnicalRevisions keeps autosave traces out of main list", () => {
  const split = splitMeaningfulAndTechnicalRevisions([
    { id: "r1", reason: "manual_save" },
    { id: "r2", reason: "publish_manual_save" },
    { id: "r3", reason: "import_bpmn" },
    { id: "r4", reason: "autosave" },
    { id: "r5", reason: "custom_domain_action" },
  ]);
  assert.deepEqual(split.meaningful.map((entry) => entry.id), ["r2", "r3"]);
  assert.deepEqual(split.technical.map((entry) => entry.id), ["r1", "r4", "r5"]);
  assert.deepEqual(split.unknown.map((entry) => entry.id), ["r5"]);
});

test("splitMeaningfulAndTechnicalRevisions preserves latest meaningful head when top raw row is technical", () => {
  const split = splitMeaningfulAndTechnicalRevisions([
    { id: "r34", version_number: 34, source_action: "manual_save" },
    { id: "r33", version_number: 33, source_action: "publish_manual_save" },
  ]);
  assert.equal(split.meaningful[0]?.id, "r33");
  assert.equal(split.technical[0]?.id, "r34");
});

test("unknown source action is fail-closed and does not break rendering", () => {
  const classification = classifyRevisionSourceAction("custom_domain_action");
  assert.equal(classification.isMeaningful, false);
  assert.equal(classification.isTechnical, false);
  assert.equal(classification.isUnknown, true);
  assert.equal(classification.allowInPublishedBadge, false);
  assert.equal(classification.allowInRevisionHistory, false);
  assert.equal(classification.allowInFileVersions, false);
  assert.equal(classification.known, false);
  assert.equal(localizeRevisionSourceAction("custom_domain_action"), "Неизвестное действие (custom_domain_action)");
});

test("resolveRevisionHistoryEmptyState returns true empty message for real empty history", () => {
  const emptyState = resolveRevisionHistoryEmptyState({
    versionsLoadStateRaw: "empty",
    meaningfulCountRaw: 0,
    technicalCountRaw: 0,
    serverEntriesCountRaw: 0,
  });
  assert.equal(emptyState.kind, "true_empty");
  assert.equal(emptyState.message.includes("Ревизий пока нет."), true);
});

test("resolveRevisionHistoryEmptyState returns filtered message when only technical entries exist", () => {
  const emptyState = resolveRevisionHistoryEmptyState({
    versionsLoadStateRaw: "empty",
    meaningfulCountRaw: 0,
    technicalCountRaw: 3,
    serverEntriesCountRaw: 3,
  });
  assert.equal(emptyState.kind, "technical_filtered");
  assert.equal(emptyState.message.includes("Технические сохранения скрыты"), true);
});

test("resolveRevisionHistoryEmptyState is disabled when meaningful revisions are visible", () => {
  const emptyState = resolveRevisionHistoryEmptyState({
    versionsLoadStateRaw: "ready",
    meaningfulCountRaw: 2,
    technicalCountRaw: 1,
    serverEntriesCountRaw: 3,
  });
  assert.equal(emptyState.kind, "none");
  assert.equal(emptyState.message, "");
});
