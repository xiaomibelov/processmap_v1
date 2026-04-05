import test from "node:test";
import assert from "node:assert/strict";

import { appendRevisionToLedger, restoreRevisionAsNewLatest } from "./revisionLedgerModule.js";
import { normalizeSessionCompanion } from "./sessionCompanionContracts.js";

function buildDraft(overrides = {}) {
  return {
    bpmn_xml_version: 10,
    bpmn_graph_fingerprint: "fp_10",
    ...overrides,
  };
}

test("one create-version action appends exactly one immutable revision", () => {
  const first = appendRevisionToLedger({}, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    draft: buildDraft({ bpmn_xml_version: 11, bpmn_graph_fingerprint: "fp_11" }),
    author: { id: "u1", name: "Alice", email: "alice@example.com" },
    comment: "Baseline",
    source: "manual_publish_revision",
    createdAt: "2026-03-17T10:00:00.000Z",
  });
  assert.equal(first.ok, true);
  assert.equal(first.revisionNumber, 1);
  assert.equal(first.nextCompanion.revision_ledger_v1.revisions.length, 1);
  assert.equal(first.nextCompanion.revision_ledger_v1.latest_revision_number, 1);
  assert.equal(first.nextCompanion.revision_ledger_v1.revisions[0].comment, "Baseline");
  assert.equal(first.nextCompanion.revision_ledger_v1.revisions[0].author.name, "Alice");
});

test("restore creates new latest revision and preserves old immutable chain", () => {
  const seedA = appendRevisionToLedger({}, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    draft: buildDraft({ bpmn_xml_version: 11, bpmn_graph_fingerprint: "fp_11" }),
    author: { id: "u1", name: "Alice" },
    comment: "A",
    source: "manual_publish_revision",
    createdAt: "2026-03-17T10:00:00.000Z",
  });
  const seedB = appendRevisionToLedger(seedA.nextCompanion, {
    xml: "<definitions id='D'><task id='Task_B'/></definitions>",
    draft: buildDraft({ bpmn_xml_version: 12, bpmn_graph_fingerprint: "fp_12" }),
    author: { id: "u2", name: "Bob" },
    comment: "B",
    source: "manual_publish_revision",
    createdAt: "2026-03-17T10:05:00.000Z",
  });

  const targetRevision = seedB.nextCompanion.revision_ledger_v1.revisions.find(
    (row) => row.comment === "A",
  );
  assert.ok(targetRevision);

  const restored = restoreRevisionAsNewLatest(seedB.nextCompanion, {
    revisionId: targetRevision.revision_id,
    draft: buildDraft({ bpmn_xml_version: 13, bpmn_graph_fingerprint: "fp_13" }),
    author: { id: "u3", name: "Carol" },
    comment: "Restore A",
    source: "restore_revision",
    createdAt: "2026-03-17T10:10:00.000Z",
  });

  assert.equal(restored.ok, true);
  const ledger = restored.nextCompanion.revision_ledger_v1;
  assert.equal(ledger.revisions.length, 3);
  assert.equal(ledger.latest_revision_number, 3);
  assert.equal(ledger.revisions[0].source, "restore_revision");
  assert.equal(ledger.revisions[0].restored_from_revision_id, targetRevision.revision_id);
  assert.equal(ledger.revisions[0].bpmn_xml, targetRevision.bpmn_xml);
  assert.equal(ledger.revisions[1].comment, "B");
  assert.equal(ledger.revisions[2].comment, "A");
});

test("live draft changes append new revision but never mutate old revisions", () => {
  const first = appendRevisionToLedger({}, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    draft: buildDraft({ bpmn_xml_version: 21, bpmn_graph_fingerprint: "fp_21" }),
    comment: "r1",
    createdAt: "2026-03-17T11:00:00.000Z",
  });
  const oldEntry = normalizeSessionCompanion(first.nextCompanion).revision_ledger_v1.revisions[0];
  const second = appendRevisionToLedger(first.nextCompanion, {
    xml: "<definitions id='D'><task id='Task_A'/><task id='Task_B'/></definitions>",
    draft: buildDraft({ bpmn_xml_version: 22, bpmn_graph_fingerprint: "fp_22" }),
    comment: "r2",
    createdAt: "2026-03-17T11:01:00.000Z",
  });
  const chain = second.nextCompanion.revision_ledger_v1.revisions;
  assert.equal(chain.length, 2);
  assert.equal(chain[1].revision_id, oldEntry.revision_id);
  assert.equal(chain[1].bpmn_xml, oldEntry.bpmn_xml);
  assert.equal(chain[1].comment, "r1");
});

test("publish duplicate guard skips append when content equals latest revision", () => {
  const first = appendRevisionToLedger({}, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    comment: "published",
    createdAt: "2026-03-17T12:00:00.000Z",
  });
  const second = appendRevisionToLedger(first.nextCompanion, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    comment: "published-again",
    createdAt: "2026-03-17T12:01:00.000Z",
    skipIfContentUnchanged: true,
  });
  assert.equal(second.ok, true);
  assert.equal(second.skipped, true);
  assert.equal(second.skipReason, "same_content_as_latest_revision");
  assert.equal(second.nextCompanion.revision_ledger_v1.revisions.length, 1);
});

test("normalize+reopen preserves full revision chain ordering", () => {
  const first = appendRevisionToLedger({}, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    comment: "r1",
    createdAt: "2026-03-17T11:10:00.000Z",
  });
  const second = appendRevisionToLedger(first.nextCompanion, {
    xml: "<definitions id='D'><task id='Task_B'/></definitions>",
    comment: "r2",
    createdAt: "2026-03-17T11:11:00.000Z",
  });
  const reopened = normalizeSessionCompanion(JSON.parse(JSON.stringify(second.nextCompanion)));
  assert.equal(reopened.revision_ledger_v1.revisions.length, 2);
  assert.equal(reopened.revision_ledger_v1.latest_revision_number, 2);
  assert.equal(reopened.revision_ledger_v1.revisions[0].comment, "r2");
  assert.equal(reopened.revision_ledger_v1.revisions[1].comment, "r1");
});

test("publish after restore remains monotonic and preserves history", () => {
  const base = appendRevisionToLedger({}, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    comment: "r1",
    createdAt: "2026-03-17T13:00:00.000Z",
  });
  const changed = appendRevisionToLedger(base.nextCompanion, {
    xml: "<definitions id='D'><task id='Task_B'/></definitions>",
    comment: "r2",
    createdAt: "2026-03-17T13:01:00.000Z",
  });
  const original = changed.nextCompanion.revision_ledger_v1.revisions.find((row) => row.comment === "r1");
  const restored = restoreRevisionAsNewLatest(changed.nextCompanion, {
    revisionId: String(original?.revision_id || ""),
    comment: "restore",
    createdAt: "2026-03-17T13:02:00.000Z",
  });
  const published = appendRevisionToLedger(restored.nextCompanion, {
    xml: "<definitions id='D'><task id='Task_A'/><task id='Task_C'/></definitions>",
    comment: "r4",
    createdAt: "2026-03-17T13:03:00.000Z",
  });
  assert.equal(published.nextCompanion.revision_ledger_v1.latest_revision_number, 4);
  assert.deepEqual(
    published.nextCompanion.revision_ledger_v1.revisions.map((row) => Number(row.revision_number || 0)),
    [4, 3, 2, 1],
  );
});

test("authoritative backend revision number drives ledger numbering", () => {
  const published = appendRevisionToLedger({}, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    comment: "published",
    source: "publish_manual_save",
    createdAt: "2026-03-17T14:00:00.000Z",
    authoritativeRevisionNumber: 8,
    authoritativeRevisionId: "ver_8",
  });

  assert.equal(published.ok, true);
  assert.equal(published.revisionNumber, 8);
  assert.equal(published.nextCompanion.revision_ledger_v1.latest_revision_number, 8);
  assert.equal(published.nextCompanion.revision_ledger_v1.revisions[0].revision_id, "ver_8");
});

test("authoritative backend revision skip guard avoids duplicate append on replay", () => {
  const first = appendRevisionToLedger({}, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    comment: "published",
    source: "publish_manual_save",
    createdAt: "2026-03-17T14:00:00.000Z",
    authoritativeRevisionNumber: 8,
    authoritativeRevisionId: "ver_8",
  });
  const replay = appendRevisionToLedger(first.nextCompanion, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    comment: "published-replay",
    source: "publish_manual_save",
    createdAt: "2026-03-17T14:01:00.000Z",
    authoritativeRevisionNumber: 8,
    authoritativeRevisionId: "ver_8",
  });

  assert.equal(replay.ok, true);
  assert.equal(replay.skipped, true);
  assert.equal(replay.skipReason, "existing_authoritative_revision");
  assert.equal(replay.nextCompanion.revision_ledger_v1.revisions.length, 1);
});
