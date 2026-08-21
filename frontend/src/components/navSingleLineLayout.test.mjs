import test from "node:test";
import assert from "node:assert/strict";
import {
  getNavSingleLineLayout,
  getWorkspaceHeaderLayout,
  NAV_META_MIN,
  NAV_CRUMBS_COLLAPSE_MAX,
  NAV_STATUS_DOT_MAX,
  NAV_BACK_ICON_MAX,
  WORKSPACE_COUNTERS_FULL_MIN,
  WORKSPACE_COUNTERS_SHORT_MIN,
  WORKSPACE_SEARCH_ICON_MAX,
  WORKSPACE_CREATE_SHORT_MAX,
} from "./navSingleLineLayout.js";

// Часть А-2 (nav-zone): пороги однострочной навигационной полосы.

test("широкая полоса: всё видно, без жертв", () => {
  const l = getNavSingleLineLayout(1134);
  assert.equal(l.showMeta, true);
  assert.equal(l.collapseCrumbs, false);
  assert.equal(l.statusDotOnly, false);
  assert.equal(l.backIconOnly, false);
});

test("порядок жертв: мета → крошки → статус точкой → кнопка иконкой", () => {
  assert.equal(getNavSingleLineLayout(NAV_META_MIN - 1).showMeta, false);
  assert.equal(getNavSingleLineLayout(NAV_META_MIN).showMeta, true);
  // крошки сворачиваются после мета
  assert.ok(NAV_CRUMBS_COLLAPSE_MAX < NAV_META_MIN);
  assert.equal(getNavSingleLineLayout(NAV_CRUMBS_COLLAPSE_MAX).collapseCrumbs, true);
  assert.equal(getNavSingleLineLayout(NAV_CRUMBS_COLLAPSE_MAX + 1).collapseCrumbs, false);
  // статус точкой раньше, чем кнопка иконкой
  assert.ok(NAV_STATUS_DOT_MAX > NAV_BACK_ICON_MAX);
  assert.equal(getNavSingleLineLayout(NAV_STATUS_DOT_MAX).statusDotOnly, true);
  assert.equal(getNavSingleLineLayout(NAV_BACK_ICON_MAX).backIconOnly, true);
  assert.equal(getNavSingleLineLayout(NAV_BACK_ICON_MAX + 1).backIconOnly, false);
});

test("типичные ширины приёмки (контейнер): 978/758/560", () => {
  // viewport 1100 → контейнер ≈978: мета скрыта, остальное полное
  const mid = getNavSingleLineLayout(978);
  assert.equal(mid.showMeta, false);
  assert.equal(mid.collapseCrumbs, false);
  assert.equal(mid.statusDotOnly, false);
  // viewport 880 → контейнер ≈758: крошки свёрнуты, статус точкой
  const narrow = getNavSingleLineLayout(758);
  assert.equal(narrow.collapseCrumbs, true);
  assert.equal(narrow.statusDotOnly, true);
  assert.equal(narrow.backIconOnly, false);
  // viewport 640 → контейнер ≈560: кнопка иконкой
  assert.equal(getNavSingleLineLayout(560).backIconOnly, true);
});

test("неизвестная ширина (0/NaN): безопасный полный режим", () => {
  const l = getNavSingleLineLayout(0);
  assert.equal(l.showMeta, false);
  assert.equal(l.collapseCrumbs, false);
  assert.equal(l.statusDotOnly, false);
  assert.equal(l.backIconOnly, false);
  assert.deepEqual(getNavSingleLineLayout(NaN), getNavSingleLineLayout(0));
});

// Workspace header layout thresholds.

test("workspace header: wide mode shows full counters and expanded controls", () => {
  const l = getWorkspaceHeaderLayout(WORKSPACE_COUNTERS_FULL_MIN);
  assert.equal(l.showCounters, true);
  assert.equal(l.shortCounters, false);
  assert.equal(l.searchIconOnly, false);
  assert.equal(l.shortCreateLabels, false);
  assert.equal(l.backIconOnly, false);
  assert.equal(l.collapseCrumbs, false);
});

test("workspace header: short counters between thresholds", () => {
  const l = getWorkspaceHeaderLayout(WORKSPACE_COUNTERS_SHORT_MIN);
  assert.equal(l.showCounters, false);
  assert.equal(l.shortCounters, true);
});

test("workspace header: narrow mode collapses controls", () => {
  const l = getWorkspaceHeaderLayout(WORKSPACE_SEARCH_ICON_MAX);
  assert.equal(l.searchIconOnly, true);
  assert.equal(l.shortCreateLabels, false);
  assert.equal(l.collapseCrumbs, false);
  const veryNarrow = getWorkspaceHeaderLayout(NAV_BACK_ICON_MAX);
  assert.equal(veryNarrow.collapseCrumbs, true);
  assert.equal(veryNarrow.backIconOnly, true);
});

test("workspace header: very narrow mode shortens create labels", () => {
  const l = getWorkspaceHeaderLayout(WORKSPACE_CREATE_SHORT_MAX);
  assert.equal(l.shortCreateLabels, true);
});

test("workspace header: unknown width is safe default", () => {
  const l = getWorkspaceHeaderLayout(0);
  assert.equal(l.showCounters, false);
  assert.equal(l.shortCounters, false);
  assert.equal(l.searchIconOnly, false);
  assert.equal(l.shortCreateLabels, false);
  assert.equal(l.backIconOnly, false);
  assert.equal(l.collapseCrumbs, false);
});
