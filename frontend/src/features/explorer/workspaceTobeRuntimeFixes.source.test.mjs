import test from "node:test";
import assert from "node:assert/strict";
import { readExplorerSources, from, around } from "../../test-utils/explorerSourceText.mjs";

// Итерация 2 runtime-фиксов feature/workspace-as-is-tobe-overview
// (fix/tobe-runtime-fixes-1): AC9 empty state по visibleRows, сброс обеих
// групп фильтров, StageBadges у листьев SessionTreeRow, колонка «Стадия» =
// контур (не статус).
const { text: source } = readExplorerSources();

test("AC9: empty state строится по итоговому видимому списку (visibleRows), не по rootItems", () => {
  const showStageEmpty = from(source, "const showStageEmpty = showTobeOverview", 900);
  assert.match(showStageEmpty, /shouldShowStageEmptyState\(\{/);
  assert.match(showStageEmpty, /visibleCount:\s*visibleRows\.length/);
  assert.match(showStageEmpty, /statusFilter:\s*effectiveStatusFilter/);
  assert.match(showStageEmpty, /stageKey,/);

  const renderBranch = around(source, 'data-testid="workspace-stage-reset"', 4500);
  assert.match(renderBranch, /\{showStageEmpty \? \(/);
  assert.doesNotMatch(renderBranch.slice(0, renderBranch.indexOf('data-testid="workspace-stage-reset"')), /rootItems\.length === 0/);
  assert.match(renderBranch, /workspaceEmptyTitle\(\{ stageKey, statusFilter: effectiveStatusFilter \}\)/);
});

test("«Сбросить фильтры» обнуляет обе группы: контур и статус", () => {
  const reset = from(source, "const resetStageFilter = useCallback", 500);
  assert.match(reset, /setStageFilterSel\(\{ as_is: false, to_be: false \}\)/);
  assert.match(reset, /setStatusFilter\("all"\)/);
});

test("листья-сессии дерева несут StageBadges контура", () => {
  const sessionTreeRow = from(source, "function SessionTreeRow(", 4000);
  assert.match(sessionTreeRow, /<StageBadges item=\{session\} show=\{showStage\} \/>/);

  const sessionsRows = from(source, "function ProjectSessionsRows(", 3600);
  assert.match(sessionsRows, /showStage = false/);
  assert.match(sessionsRows, /showStage=\{showStage\}/);

  const callSite = around(source, 'key={`project-sessions-${row.parentId}`}', 1200);
  assert.match(callSite, /showStage=\{showTobeOverview\}/);
});

test("колонка «Стадия» SessionRow рендерит контур (StageBadges), не статус", () => {
  const stageCell = from(source, "Колонка «Стадия» — контур AS IS/TO BE", 700);
  assert.match(stageCell, /<StageBadges item=\{session\} show \/>/);
  assert.match(stageCell, /normalizeStageBadges\(session\?\.stage_badges\)\.length/);
  assert.doesNotMatch(stageCell, /sessionStatusMeta\.label/);
  assert.doesNotMatch(stageCell, /session\.stage \|\|/);
});

test("ContextMenu — keyboard-контракт (role/фокус/Esc-возврат)", () => {
  const menu = from(source, "export function ContextMenu(", 4200);
  assert.match(menu, /role="menu"/);
  assert.match(menu, /aria-orientation="vertical"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(menu, /role="separator"/);
  assert.match(menu, /data-menu-index=\{i\}/);
  assert.match(menu, /resolveMenuKey\(items,/);
  assert.match(menu, /focusTrigger\(\)/);
  // Ветка Escape: возврат фокуса на триггер ПЕРЕД onClose().
  const closeBranch = from(menu, "if (resolved.close)", 220);
  assert.match(closeBranch, /focusTrigger\(\);\s*onClose\(\);/);
});
