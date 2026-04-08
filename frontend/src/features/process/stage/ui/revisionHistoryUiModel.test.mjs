import test from "node:test";
import assert from "node:assert/strict";

import {
  formatRevisionAuthor,
  formatRevisionTimestampRu,
  normalizeRevisionTimestampMs,
  resolveRevisionHistoryUiSnapshot,
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
