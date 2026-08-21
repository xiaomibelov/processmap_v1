import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeAttentionMarkers,
  createAttentionMarker,
  isAttentionMarkerUnread,
  markAttentionMarkersSeen,
  countAttentionMarkers,
  countUnreadAttentionMarkers,
} from "./attentionMarkers.js";

test("normalizeAttentionMarkers keeps valid markers only", () => {
  const markers = normalizeAttentionMarkers([
    { id: "a1", message: "Check flow", created_at: 10 },
    { id: "a2", text: "No message key", created_at: 12 },
    { id: "", message: "invalid" },
    null,
  ]);
  assert.equal(markers.length, 2);
  assert.equal(markers[0].id, "a2");
  assert.equal(markers[1].id, "a1");
});

test("create + seen flow updates unread counters", () => {
  const marker = createAttentionMarker({
    message: "Review gateway",
    nodeId: "Gateway_1",
    createdBy: "u_admin",
    createdAt: 100,
  });
  assert.equal(marker.node_id, "Gateway_1");
  assert.equal(marker.is_checked, false);

  const unreadBefore = isAttentionMarkerUnread(marker, "u_admin", 0);
  assert.equal(unreadBefore, true);

  const seen = markAttentionMarkersSeen([marker], "u_admin", [marker.id], 101);
  assert.equal(seen.length, 1);
  assert.equal(isAttentionMarkerUnread(seen[0], "u_admin", 0), false);
});

test("workspace counters respect show flag and checked markers", () => {
  const markers = normalizeAttentionMarkers([
    { id: "a1", message: "m1", created_at: 1, is_checked: false },
    { id: "a2", message: "m2", created_at: 2, is_checked: true },
  ]);
  assert.equal(countAttentionMarkers(markers, { showOnWorkspace: true }), 1);
  assert.equal(countAttentionMarkers(markers, { showOnWorkspace: false }), 0);
  assert.equal(countUnreadAttentionMarkers(markers, "u1", 0), 1);
});
