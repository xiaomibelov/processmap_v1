import test from "node:test";
import assert from "node:assert/strict";

import {
  applyUserFacingRevisionNumbers,
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

  const unknown = formatRevisionAuthor({});
  assert.equal(unknown.label, "Автор не указан");
});

test("resolveRevisionHistoryUiSnapshot keeps user-facing revision number independent from technical snapshot number", () => {
  const resolved = resolveRevisionHistoryUiSnapshot({
    revisionHistorySnapshotRaw: {
      latestRevisionNumber: 12,
      latestRevisionDisplayNumber: 4,
      totalCount: 4,
      latestRevisionId: "ledger_r4",
      draftState: { isDraftAheadOfLatestRevision: false },
    },
    latestVersionItemRaw: {
      id: "ver_6",
      revisionNumber: 6,
      technicalRevisionNumber: 6,
      source_action: "publish_manual_save",
    },
    latestVersionStatusRaw: "ready",
  });
  assert.equal(resolved.latestRevisionNumber, 4);
  assert.equal(resolved.latestRevisionId, "ver_6");
  assert.equal(resolved.latestPublishedRevisionNumber, 4);
  assert.equal(resolved.latestPublishedRevisionTechnicalNumber, 6);
  assert.equal(resolved.latestPublishedRevisionId, "ver_6");
  assert.equal(resolved.latestPublishedRevisionStatus, "ready");
  assert.equal(resolved.latestLedgerRevisionNumber, 4);
  assert.equal(resolved.latestLedgerRevisionTechnicalNumber, 12);
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
  ]);
  assert.deepEqual(split.meaningful.map((entry) => entry.id), ["r2", "r3"]);
  assert.deepEqual(split.technical.map((entry) => entry.id), ["r1", "r4"]);
});

test("splitMeaningfulAndTechnicalRevisions preserves latest meaningful head when top raw row is technical", () => {
  const split = splitMeaningfulAndTechnicalRevisions([
    { id: "r34", version_number: 34, source_action: "manual_save" },
    { id: "r33", version_number: 33, source_action: "publish_manual_save" },
  ]);
  assert.equal(split.meaningful[0]?.id, "r33");
  assert.equal(split.technical[0]?.id, "r34");
});

test("applyUserFacingRevisionNumbers maps meaningful entries to contiguous user-facing sequence", () => {
  const list = applyUserFacingRevisionNumbers({
    meaningfulRevisionsRaw: [
      { id: "r10", revisionNumber: 10, technicalRevisionNumber: 10 },
      { id: "r7", revisionNumber: 7, technicalRevisionNumber: 7 },
      { id: "r5", revisionNumber: 5, technicalRevisionNumber: 5 },
    ],
    revisionHistorySnapshotRaw: {
      latestRevisionDisplayNumber: 3,
      totalCount: 3,
    },
  });
  assert.deepEqual(
    list.map((row) => ({
      id: row.id,
      revisionNumber: row.revisionNumber,
      technicalRevisionNumber: row.technicalRevisionNumber,
    })),
    [
      { id: "r10", revisionNumber: 3, technicalRevisionNumber: 10 },
      { id: "r7", revisionNumber: 2, technicalRevisionNumber: 7 },
      { id: "r5", revisionNumber: 1, technicalRevisionNumber: 5 },
    ],
  );
});

test("applyUserFacingRevisionNumbers uses server head count when the loaded window is partial", () => {
  const list = applyUserFacingRevisionNumbers({
    meaningfulRevisionsRaw: [
      { id: "r55", version_number: 55, technicalRevisionNumber: 55 },
      { id: "r51", version_number: 51, technicalRevisionNumber: 51 },
      { id: "r49", version_number: 49, technicalRevisionNumber: 49 },
    ],
    revisionHistorySnapshotRaw: {
      latestRevisionDisplayNumber: 10,
      totalCount: 10,
    },
  });
  assert.deepEqual(
    list.map((row) => ({ id: row.id, revisionNumber: row.revisionNumber })),
    [
      { id: "r55", revisionNumber: 10 },
      { id: "r51", revisionNumber: 9 },
      { id: "r49", revisionNumber: 8 },
    ],
  );
});

test("unknown source action is fail-closed and does not enter meaningful surfaces", () => {
  const classification = classifyRevisionSourceAction("custom_domain_action");
  assert.equal(classification.isMeaningful, false);
  assert.equal(classification.isTechnical, false);
  assert.equal(classification.isUnknown, true);
  assert.equal(classification.allowInRevisionHistory, false);
  assert.equal(classification.allowInFileVersions, false);
  assert.equal(classification.allowInPublishedBadge, false);
  assert.equal(classification.known, false);
  assert.equal(localizeRevisionSourceAction("custom_domain_action"), "custom_domain_action");
});

test("resolveRevisionHistoryUiSnapshot keeps published head empty for unknown latest action", () => {
  const resolved = resolveRevisionHistoryUiSnapshot({
    revisionHistorySnapshotRaw: {
      latestRevisionNumber: 4,
      latestRevisionId: "ledger_r4",
    },
    latestVersionItemRaw: {
      id: "raw_99",
      revisionNumber: 99,
      source_action: "custom_domain_action",
    },
    latestVersionStatusRaw: "ready",
  });
  assert.equal(resolved.latestPublishedRevisionAllowed, false);
  assert.equal(resolved.latestPublishedRevisionNumber, 0);
  assert.equal(resolved.latestPublishedRevisionId, "");
  assert.equal(resolved.latestRevisionNumber, 4);
});

test("resolveRevisionHistoryEmptyState returns true empty message for real empty history", () => {
  const emptyState = resolveRevisionHistoryEmptyState({
    versionsLoadStateRaw: "empty",
    meaningfulCountRaw: 0,
    technicalCountRaw: 0,
    serverEntriesCountRaw: 0,
  });
  assert.equal(emptyState.kind, "true_empty");
  assert.equal(emptyState.message.includes("Версий пока нет."), true);
});

test("resolveRevisionHistoryEmptyState returns filtered message when only technical entries exist", () => {
  const emptyState = resolveRevisionHistoryEmptyState({
    versionsLoadStateRaw: "empty",
    meaningfulCountRaw: 0,
    technicalCountRaw: 3,
    serverEntriesCountRaw: 3,
  });
  assert.equal(emptyState.kind, "technical_filtered");
  assert.equal(emptyState.message.includes("Пользовательских версий пока нет."), true);
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
