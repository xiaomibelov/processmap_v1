import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPLORER_LAYOUT_COMPACT_MAX,
  EXPLORER_LAYOUT_FULL_MIN,
  EXPLORER_LAYOUT_NO_UPDATED_MIN,
  EXPLORER_LAYOUT_NO_ASSIGNEE_MIN,
  EXPLORER_NAME_MIN_WIDTH,
  buildExplorerRowMeta,
  explorerMarqueeMotion,
  explorerVisibleColumnCount,
  getExplorerColumnLayout,
  isExplorerTextTruncated,
} from "./explorerColumnVisibility.js";

// projects-table-ux: тип сущности визуально находится в ячейке «Название»,
// отдельной колонки «Тип» в шапке нет.
test("full layout at/above threshold and for unknown width (first frame before RO)", () => {
  for (const w of [0, -10, NaN, Infinity, EXPLORER_LAYOUT_FULL_MIN, 1440]) {
    const l = getExplorerColumnLayout(w);
    assert.equal(l.compact, false, `w=${w}`);
    assert.equal(l.showUpdated, true, `w=${w}`);
    assert.equal(l.showAssignee, true, `w=${w}`);
    assert.equal(l.showComposition, true, `w=${w}`);
    assert.equal(l.showType, false, `w=${w}`);
    assert.equal(l.nameMinWidth, EXPLORER_NAME_MIN_WIDTH);
  }
});

test("hide order: Обновлено first, then Ответственный, then Состав; Название/Статус never hidden", () => {
  const l1 = getExplorerColumnLayout(EXPLORER_LAYOUT_FULL_MIN - 1);
  assert.deepEqual(
    [l1.showUpdated, l1.showAssignee, l1.showComposition, l1.showType, l1.compact],
    [false, true, true, false, false],
  );
  const l2 = getExplorerColumnLayout(EXPLORER_LAYOUT_NO_UPDATED_MIN - 1);
  assert.deepEqual(
    [l2.showUpdated, l2.showAssignee, l2.showComposition, l2.showType, l2.compact],
    [false, false, true, false, false],
  );
  const l2b = getExplorerColumnLayout(EXPLORER_LAYOUT_NO_ASSIGNEE_MIN - 1);
  assert.deepEqual(
    [l2b.showUpdated, l2b.showAssignee, l2b.showComposition, l2b.showType, l2b.compact],
    [false, false, false, false, false],
  );
  const l3 = getExplorerColumnLayout(EXPLORER_LAYOUT_COMPACT_MAX + 1); // 680
  assert.equal(l3.compact, false);
  assert.equal(l3.showComposition, true);
});

test("compact <680: only Название/Статус columns, meta-line mode, name not squeezed", () => {
  for (const w of [320, 500, EXPLORER_LAYOUT_COMPACT_MAX]) {
    const l = getExplorerColumnLayout(w);
    assert.equal(l.compact, true, `w=${w}`);
    assert.deepEqual([l.showType, l.showComposition, l.showAssignee, l.showUpdated], [false, false, false, false]);
    assert.equal(l.nameMinWidth, 0); // двухстрочная строка: название берёт всю ширину
  }
});

test("signal columns shift upper thresholds by +72 (tree профиль сейчас без них)", () => {
  const l = getExplorerColumnLayout(EXPLORER_LAYOUT_FULL_MIN + 71, { signalColumns: true });
  assert.equal(l.showUpdated, false);
  const lFull = getExplorerColumnLayout(EXPLORER_LAYOUT_FULL_MIN + 72, { signalColumns: true });
  assert.equal(lFull.showUpdated, true);
});

test("visible column count drives colSpan of inline rows", () => {
  assert.equal(explorerVisibleColumnCount(getExplorerColumnLayout(1440)), 6);
  assert.equal(explorerVisibleColumnCount(getExplorerColumnLayout(1000)), 5);
  assert.equal(explorerVisibleColumnCount(getExplorerColumnLayout(800)), 4);
  assert.equal(explorerVisibleColumnCount(getExplorerColumnLayout(500)), 3);
  assert.equal(explorerVisibleColumnCount(getExplorerColumnLayout(1440), { signalColumns: true }), 8);
  assert.equal(explorerVisibleColumnCount(null), 6); // default safe
});

test("isExplorerTextTruncated: scrollWidth > clientWidth (+1px субпиксельный запас)", () => {
  assert.equal(isExplorerTextTruncated(500, 300), true);
  assert.equal(isExplorerTextTruncated(300, 300), false);
  assert.equal(isExplorerTextTruncated(301, 300), false); // в пределах запаса
  assert.equal(isExplorerTextTruncated(302, 300), true);
  assert.equal(isExplorerTextTruncated(NaN, 300), false);
  assert.equal(isExplorerTextTruncated(500, 0), false);
});

test("explorerMarqueeMotion: shift = scrollWidth - clientWidth, duration 40px/s clamped 3..12s", () => {
  assert.deepEqual(explorerMarqueeMotion(300, 300), { shiftPx: 0, durationSec: 0 });
  assert.deepEqual(explorerMarqueeMotion(420, 300), { shiftPx: 120, durationSec: 3 });
  assert.deepEqual(explorerMarqueeMotion(700, 300), { shiftPx: 400, durationSec: 10 });
  assert.equal(explorerMarqueeMotion(3000, 300).durationSec, 12);
});

test("buildExplorerRowMeta: состав · ответственный · обновлено, пустые части опущены", () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const folder = {
    type: "folder",
    descendant_projects_count: 2,
    descendant_trackable_sessions_count: 5,
    descendant_done_sessions_count: 1,
    responsible_user: { display_name: "Иван Петров" },
    updated_at: nowSec - 3600 * 5,
  };
  assert.equal(buildExplorerRowMeta(folder, "folder"), "2 проекта · 1/5 · Иван · 5 ч назад");

  const project = {
    type: "project",
    trackable_sessions_count: 3,
    done_sessions_count: 3,
    executor_user: { name: "Мария" },
    updated_at: nowSec - 30,
  };
  assert.equal(buildExplorerRowMeta(project, "project"), "3/3 · Мария · только что");

  // без ответственного — часть опущена; без дат — часть опущена
  const bare = { sessions_count: 0 };
  assert.equal(buildExplorerRowMeta(bare, "project"), "0/0");

  // session: состава и ответственного нет — только «обновлено»
  const session = { updated_at: nowSec - 120 };
  assert.equal(buildExplorerRowMeta(session, "session"), "2 мин назад");
});
