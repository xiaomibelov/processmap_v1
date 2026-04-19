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
    text: "Версия 40",
    title: "Последняя опубликованная версия",
  });
});

test("latest ledger revision alone does not masquerade as published version", () => {
  const badge = resolvePublishedRevisionBadgeView({
    latestRevisionNumber: 41,
    latestPublishedRevisionNumber: 0,
    latestPublishedRevisionStatus: "loading",
  });
  assert.deepEqual(badge, {
    testId: "diagram-toolbar-latest-revision-empty",
    text: "Не опубликовано",
    title: "Опубликованных версий нет",
  });
});

test("technical-only revision head does not appear as published badge", () => {
  const badge = resolvePublishedRevisionBadgeView({
    latestRevisionNumber: 106,
    latestPublishedRevisionNumber: 0,
    latestPublishedRevisionStatus: "failed",
  });
  assert.deepEqual(badge, {
    testId: "diagram-toolbar-latest-revision-empty",
    text: "Не опубликовано",
    title: "Опубликованных версий нет",
  });
});

test("published revision badge shows explicit no-publish state instead of pseudo revision number", () => {
  const badge = resolvePublishedRevisionBadgeView({
    latestRevisionNumber: 0,
    latestPublishedRevisionNumber: 0,
    latestPublishedRevisionStatus: "idle",
  });
  assert.deepEqual(badge, {
    testId: "diagram-toolbar-latest-revision-empty",
    text: "Не опубликовано",
    title: "Опубликованных версий нет",
  });
});

test("explicit published revision value is the only source for version badge", () => {
  const badge = resolvePublishedRevisionBadgeView({
    latestRevisionNumber: 999,
    latestPublishedRevisionNumber: 7,
    latestPublishedRevisionStatus: "idle",
  });
  assert.deepEqual(badge, {
    testId: "diagram-toolbar-latest-revision",
    text: "Версия 7",
    title: "Последняя опубликованная версия",
  });
});

test("badge stays unpublished when published number is present but explicitly disallowed", () => {
  const badge = resolvePublishedRevisionBadgeView({
    latestPublishedRevisionNumber: 12,
    latestPublishedRevisionAllowed: false,
  });
  assert.deepEqual(badge, {
    testId: "diagram-toolbar-latest-revision-empty",
    text: "Не опубликовано",
    title: "Опубликованных версий нет",
  });
});
