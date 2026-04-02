import test from "node:test";
import assert from "node:assert/strict";

import buildSessionRevisionReadModel from "./revisionReadModel.js";
import { appendRevisionToLedger } from "../revisionLedgerModule.js";

function buildLedger() {
  return {
    schema_version: "revision_ledger_v1",
    latest_revision_number: 2,
    latest_revision_id: "rev_2",
    current_revision_id: "rev_2",
    revisions: [
      {
        revision_id: "rev_2",
        revision_number: 2,
        created_at: "2026-03-17T12:00:00.000Z",
        comment: "Second",
        source: "manual_publish_revision",
        bpmn_xml: "<definitions id='D'><task id='Task_A'/><task id='Task_B'/></definitions>",
        content_hash: "h2",
        author: { id: "u2", name: "Bob" },
      },
      {
        revision_id: "rev_1",
        revision_number: 1,
        created_at: "2026-03-17T11:00:00.000Z",
        comment: "First",
        source: "manual_publish_revision",
        bpmn_xml: "<definitions id='D'><task id='Task_A'/></definitions>",
        content_hash: "h1",
        author: { id: "u1", name: "Alice" },
      },
    ],
  };
}

test("read model exposes revision list, latest pointers, and draft-ahead state", () => {
  const model = buildSessionRevisionReadModel({
    companionRevisionLedgerRaw: buildLedger(),
    companionSource: "jazz_companion",
    bridgeMode: "jazz_preferred_with_legacy_fallback",
    liveDraftRaw: {
      bpmn_xml: "<definitions id='D'><task id='Task_A'/><task id='Task_B'/><task id='Task_C'/></definitions>",
    },
  });
  assert.equal(model.totalCount, 2);
  assert.equal(model.latestRevisionNumber, 2);
  assert.equal(model.latestRevisionId, "rev_2");
  assert.equal(model.revisions[0].revisionNumber, 2);
  assert.equal(model.revisions[1].revisionNumber, 1);
  assert.equal(model.revisions[0].authorName, "Bob");
  assert.equal(model.effectiveSource, "jazz_companion:revision_ledger_v1");
  assert.equal(model.draftState.isDraftAheadOfLatestRevision, true);
});

test("missing revision ledger is surfaced as warning and does not crash", () => {
  const model = buildSessionRevisionReadModel({
    companionRevisionLedgerRaw: null,
    companionSource: "legacy_companion",
    bridgeMode: "legacy_only",
    liveDraftRaw: { bpmn_xml: "<definitions id='D'></definitions>" },
  });
  assert.equal(model.totalCount, 0);
  assert.equal(model.isMissing, true);
  assert.equal(model.effectiveSource, "missing");
  assert.equal(model.readinessState, "warning");
});

test("history read model deduplicates repeated ledger entries and keeps monotonic order", () => {
  const model = buildSessionRevisionReadModel({
    companionRevisionLedgerRaw: {
      schema_version: "revision_ledger_v1",
      latest_revision_number: 3,
      latest_revision_id: "rev_3",
      current_revision_id: "rev_3",
      revisions: [
        {
          revision_id: "rev_3",
          revision_number: 3,
          created_at: "2026-03-17T12:10:00.000Z",
          bpmn_xml: "<definitions id='D'><task id='Task_3'/></definitions>",
        },
        {
          revision_id: "rev_2",
          revision_number: 2,
          created_at: "2026-03-17T12:09:00.000Z",
          bpmn_xml: "<definitions id='D'><task id='Task_2'/></definitions>",
        },
        {
          revision_id: "rev_2",
          revision_number: 2,
          created_at: "2026-03-17T12:09:00.000Z",
          bpmn_xml: "<definitions id='D'><task id='Task_2'/></definitions>",
        },
      ],
    },
  });
  assert.equal(model.revisions.length, 2);
  assert.deepEqual(
    model.revisions.map((row) => row.revisionNumber),
    [3, 2],
  );
});

test("draft-ahead state clears after publish creates latest revision with current draft xml", () => {
  const first = appendRevisionToLedger({}, {
    xml: "<definitions id='D'><task id='Task_A'/></definitions>",
    comment: "r1",
    createdAt: "2026-03-17T15:00:00.000Z",
  });
  const beforePublish = buildSessionRevisionReadModel({
    companionRevisionLedgerRaw: first.nextCompanion.revision_ledger_v1,
    liveDraftRaw: { bpmn_xml: "<definitions id='D'><task id='Task_A'/><task id='Task_B'/></definitions>" },
  });
  assert.equal(beforePublish.draftState.isDraftAheadOfLatestRevision, true);

  const published = appendRevisionToLedger(first.nextCompanion, {
    xml: "<definitions id='D'><task id='Task_A'/><task id='Task_B'/></definitions>",
    comment: "r2",
    createdAt: "2026-03-17T15:01:00.000Z",
  });
  const afterPublish = buildSessionRevisionReadModel({
    companionRevisionLedgerRaw: published.nextCompanion.revision_ledger_v1,
    liveDraftRaw: { bpmn_xml: "<definitions id='D'><task id='Task_A'/><task id='Task_B'/></definitions>" },
  });
  assert.equal(afterPublish.latestRevisionNumber, 2);
  assert.equal(afterPublish.draftState.isDraftAheadOfLatestRevision, false);
});
