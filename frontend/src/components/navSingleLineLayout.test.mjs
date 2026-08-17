import test from "node:test";
import assert from "node:assert/strict";
import {
  getNavSingleLineLayout,
  NAV_META_MIN,
  NAV_CRUMBS_COLLAPSE_MAX,
  NAV_STATUS_DOT_MAX,
  NAV_BACK_ICON_MAX,
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

test("типичные ширины приёмки (контейнер): 794/574/334", () => {
  // viewport 1100 → контейнер ≈794: мета скрыта, крошки свёрнуты
  const mid = getNavSingleLineLayout(794);
  assert.equal(mid.showMeta, false);
  assert.equal(mid.collapseCrumbs, true);
  assert.equal(mid.statusDotOnly, false);
  // viewport 880 → контейнер ≈574: статус точкой
  const narrow = getNavSingleLineLayout(574);
  assert.equal(narrow.statusDotOnly, true);
  assert.equal(narrow.backIconOnly, false);
  // viewport 640 → контейнер ≈334: кнопка иконкой
  assert.equal(getNavSingleLineLayout(334).backIconOnly, true);
});

test("неизвестная ширина (0/NaN): безопасный полный режим", () => {
  const l = getNavSingleLineLayout(0);
  assert.equal(l.showMeta, false);
  assert.equal(l.collapseCrumbs, false);
  assert.equal(l.statusDotOnly, false);
  assert.equal(l.backIconOnly, false);
  assert.deepEqual(getNavSingleLineLayout(NaN), getNavSingleLineLayout(0));
});
