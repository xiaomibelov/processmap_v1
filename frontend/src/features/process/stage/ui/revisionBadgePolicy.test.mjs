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

test("published revision badge uses fallback published revision while authoritative head is loading", () => {
  const badge = resolvePublishedRevisionBadgeView({
    latestRevisionNumber: 41,
    latestPublishedRevisionNumber: 0,
    latestPublishedRevisionStatus: "loading",
  });
  assert.deepEqual(badge, {
    testId: "diagram-toolbar-latest-revision-fallback",
    text: "Версия 41",
    title: "Сверяем последнюю опубликованную версию",
  });
});

test("published revision badge keeps human-readable fallback when authoritative head failed and ledger shows history", () => {
  const badge = resolvePublishedRevisionBadgeView({
    latestRevisionNumber: 41,
    latestPublishedRevisionNumber: 0,
    latestPublishedRevisionStatus: "failed",
  });
  assert.deepEqual(badge, {
    testId: "diagram-toolbar-latest-revision-fallback",
    text: "Версия 41",
    title: "Отображается последняя доступная опубликованная версия",
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
