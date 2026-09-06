import test from "node:test";
import assert from "node:assert/strict";

import { resolveRevisionHistoryUiSnapshot } from "./revisionHistoryUiModel.js";

function versionItem(userFacingNumber) {
  return {
    id: `ver_${userFacingNumber}`,
    userFacingRevisionNumber: userFacingNumber,
    technicalRevisionNumber: userFacingNumber,
    source_action: "publish_manual_save",
  };
}

test("model keeps the resolved version number while the head refetch is loading (stale-while-revalidate input)", () => {
  const ready = resolveRevisionHistoryUiSnapshot({
    revisionHistorySnapshotRaw: {},
    latestVersionItemRaw: versionItem(2),
    latestVersionStatusRaw: "ready",
  });
  assert.equal(ready.latestPublishedRevisionNumber, 2);

  const sameHead = { ...versionItem(2) };
  const loading = resolveRevisionHistoryUiSnapshot({
    revisionHistorySnapshotRaw: {},
    latestVersionItemRaw: sameHead,
    latestVersionStatusRaw: "loading",
  });
  assert.equal(loading.latestPublishedRevisionNumber, 2, "last-known head must keep the chip at V. 2 during refetch");
  assert.equal(loading.latestPublishedRevisionStatus, "loading");
});

test("model increments the resolved version number when the refetch returns a newer version row", () => {
  const before = resolveRevisionHistoryUiSnapshot({
    revisionHistorySnapshotRaw: {},
    latestVersionItemRaw: versionItem(2),
    latestVersionStatusRaw: "ready",
  });
  assert.equal(before.latestPublishedRevisionNumber, 2);

  const after = resolveRevisionHistoryUiSnapshot({
    revisionHistorySnapshotRaw: {},
    latestVersionItemRaw: versionItem(3),
    latestVersionStatusRaw: "ready",
  });
  assert.equal(after.latestPublishedRevisionNumber, 3, "chip must visibly increment after publish");
  assert.equal(after.latestPublishedRevisionId, "ver_3");
});
