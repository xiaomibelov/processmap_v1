import test from "node:test";
import assert from "node:assert/strict";

import { resolvePublishedRevisionBadgeView } from "./revisionBadgePolicy.js";

test("published revision badge uses authoritative backend head when ready", () => {
  const badge = resolvePublishedRevisionBadgeView({
    latestRevisionNumber: 41,
    latestPublishedRevisionNumber: 40,
    latestPublishedRevisionStatus: "ready",
  });
  assert.deepEqual(badge, {
    testId: "diagram-toolbar-latest-revision",
    text: "r40",
    title: "",
  });
});

test("published revision badge stays pending while authoritative head is loading even if ledger is ahead", () => {
  const badge = resolvePublishedRevisionBadgeView({
    latestRevisionNumber: 41,
    latestPublishedRevisionNumber: 0,
    latestPublishedRevisionStatus: "loading",
  });
  assert.deepEqual(badge, {
    testId: "diagram-toolbar-latest-revision-pending",
    text: "r…",
    title: "Сверяем опубликованную ревизию",
  });
});

test("published revision badge does not fall back to R0 when authoritative head failed and ledger shows history", () => {
  const badge = resolvePublishedRevisionBadgeView({
    latestRevisionNumber: 41,
    latestPublishedRevisionNumber: 0,
    latestPublishedRevisionStatus: "failed",
  });
  assert.deepEqual(badge, {
    testId: "diagram-toolbar-latest-revision-unavailable",
    text: "r?",
    title: "Не удалось проверить опубликованную ревизию",
  });
});
