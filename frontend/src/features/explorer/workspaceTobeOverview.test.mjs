import test from "node:test";
import assert from "node:assert/strict";

import {
  STAGE_AS_IS,
  STAGE_TO_BE,
  TOBE_CREATE_STORAGE_KEY,
  TOBE_OVERVIEW_FLAG_KEY,
  TOBE_OVERVIEW_PILOT_ORG_IDS,
  isTobeOverviewEnabled,
  isTobeOverviewPilotOrg,
  normalizeStageBadges,
  shouldShowStageEmptyState,
  stageCountsText,
  stageEmptyTitle,
  stageFilterToKey,
  stageKeyToFilter,
  stageKeyToStages,
  stageLabel,
  stageSummaryText,
  tobeCoverageText,
  tobeTooltipText,
  workspaceEmptyTitle,
} from "./workspaceTobeOverview.js";

test("flag key and storage key are stable contracts", () => {
  assert.equal(TOBE_OVERVIEW_FLAG_KEY, "workspace_tobe_overview");
  assert.equal(TOBE_CREATE_STORAGE_KEY, "pm_tobe_create_project");
});

test("gate: requires flag on AND pilot org", () => {
  const pilotOrgId = "8b89c83ea810";
  assert.equal(TOBE_OVERVIEW_PILOT_ORG_IDS.length, 1, "пилот ровно одна org");
  assert.ok(TOBE_OVERVIEW_PILOT_ORG_IDS.includes(pilotOrgId), "пилот содержит org «Роботизация производств»");
  assert.equal(isTobeOverviewEnabled({ flagOn: true, orgId: pilotOrgId }), true);
  assert.equal(isTobeOverviewEnabled({ flagOn: true, orgId: "org_1" }), false);
  assert.equal(isTobeOverviewEnabled({ flagOn: false, orgId: pilotOrgId }), false);
  assert.equal(isTobeOverviewPilotOrg("org_1"), false);
  assert.equal(isTobeOverviewPilotOrg(""), false);
});

test("normalizeStageBadges keeps only known stages in canonical order", () => {
  assert.deepEqual(normalizeStageBadges(["to_be", "as_is"]), [STAGE_AS_IS, STAGE_TO_BE]);
  assert.deepEqual(normalizeStageBadges(["to_be"]), [STAGE_TO_BE]);
  assert.deepEqual(normalizeStageBadges(["junk", null]), []);
  assert.deepEqual(normalizeStageBadges("as_is"), []);
  assert.deepEqual(normalizeStageBadges(undefined), []);
});

test("stage filter key round-trips both directions", () => {
  assert.equal(stageFilterToKey({ as_is: false, to_be: false }), "");
  assert.equal(stageFilterToKey({ as_is: true, to_be: false }), "as_is");
  assert.equal(stageFilterToKey({ as_is: false, to_be: true }), "to_be");
  assert.equal(stageFilterToKey({ as_is: true, to_be: true }), "as_is+to_be");
  assert.deepEqual(stageKeyToFilter(""), { as_is: false, to_be: false });
  assert.deepEqual(stageKeyToFilter("to_be"), { as_is: false, to_be: true });
  assert.deepEqual(stageKeyToFilter("as_is"), { as_is: true, to_be: false });
  assert.deepEqual(stageKeyToFilter("as_is+to_be"), { as_is: true, to_be: true });
  assert.deepEqual(stageKeyToStages("to_be"), [STAGE_TO_BE]);
  assert.deepEqual(stageKeyToStages(""), []);
  assert.deepEqual(stageKeyToStages("junk+to_be"), [STAGE_TO_BE]);
});

test("stageCountsText renders AS IS / TO BE breakdown", () => {
  assert.equal(stageCountsText({ as_is: 2, to_be: 1 }), "AS IS 2 · TO BE 1");
  assert.equal(stageCountsText({ as_is: 0, to_be: 0 }), "AS IS 0 · TO BE 0");
  assert.equal(stageCountsText(undefined), "AS IS 0 · TO BE 0");
  assert.equal(stageCountsText({ as_is: "3", to_be: "junk" }), "AS IS 3 · TO BE 0");
});

test("tobeTooltipText describes TO BE descriptions and last update", () => {
  assert.equal(tobeTooltipText({ counters: { to_be: 0 } }), "");
  assert.equal(tobeTooltipText({ counters: { to_be: 1 }, tobe: {} }), "TO BE: 1 описание");
  assert.equal(
    tobeTooltipText({ counters: { to_be: 3 }, tobe: { last_updated_at: 1700000000 }, formatRelative: (ts) => `t${ts}` }),
    "TO BE: 3 описания, последнее — t1700000000",
  );
  assert.equal(
    tobeTooltipText({ counters: { to_be: 11 }, tobe: { last_updated_at: 1700000000 }, formatRelative: () => "вчера" }),
    "TO BE: 11 описаний, последнее — вчера",
  );
});

test("tobeCoverageText renders with_tobe/total and hides empty", () => {
  assert.equal(tobeCoverageText({ with_tobe: 2, total: 3 }), "Покрытие TO BE: 2/3");
  assert.equal(tobeCoverageText({ with_tobe: 0, total: 1 }), "Покрытие TO BE: 0/1");
  assert.equal(tobeCoverageText({ with_tobe: 0, total: 0 }), "");
  assert.equal(tobeCoverageText(null), "");
});

test("stageSummaryText summarizes matched branches and TO BE schemes", () => {
  assert.equal(
    stageSummaryText({ matched_branches: 4, matched_counts: { as_is: 2, to_be: 3 } }),
    "Показано: 4 веток · TO BE 3 схем",
  );
  assert.equal(stageSummaryText({}), "Показано: 0 веток · TO BE 0 схем");
  assert.equal(stageSummaryText(null), "Показано: 0 веток · TO BE 0 схем");
});

test("stageEmptyTitle names the active stage filter", () => {
  assert.equal(stageEmptyTitle("to_be"), "Нет веток по фильтру TO BE");
  assert.equal(stageEmptyTitle("as_is"), "Нет веток по фильтру AS IS");
  assert.equal(stageEmptyTitle("as_is+to_be"), "Нет веток по фильтру контура");
  assert.equal(stageEmptyTitle(""), "Нет веток по фильтру контура");
});

test("shouldShowStageEmptyState: пустой ВИДИМЫЙ список + активный фильтр любой группы", () => {
  // AC9 / S3: TO BE + статус «Готово» → 0 видимых строк при непустом rootItems.
  assert.equal(
    shouldShowStageEmptyState({ visibleCount: 0, statusFilter: "done", stageKey: "to_be", loading: false, error: null }),
    true,
  );
  // Пусто от сервера при активном stage-фильтре (существующий кейс).
  assert.equal(
    shouldShowStageEmptyState({ visibleCount: 0, statusFilter: "all", stageKey: "as_is", loading: false, error: null }),
    true,
  );
  // Только клиентский статус-фильтр.
  assert.equal(
    shouldShowStageEmptyState({ visibleCount: 0, statusFilter: "active", stageKey: "", loading: false, error: null }),
    true,
  );
  // Обычная пустота без фильтров — обычный empty state, не stage.
  assert.equal(
    shouldShowStageEmptyState({ visibleCount: 0, statusFilter: "all", stageKey: "", loading: false, error: null }),
    false,
  );
  // Есть видимые строки — empty state не нужен, даже с фильтрами.
  assert.equal(
    shouldShowStageEmptyState({ visibleCount: 3, statusFilter: "done", stageKey: "to_be", loading: false, error: null }),
    false,
  );
  // Загрузка и ошибка блокируют empty state.
  assert.equal(
    shouldShowStageEmptyState({ visibleCount: 0, statusFilter: "done", stageKey: "to_be", loading: true, error: null }),
    false,
  );
  assert.equal(
    shouldShowStageEmptyState({ visibleCount: 0, statusFilter: "done", stageKey: "to_be", loading: false, error: "boom" }),
    false,
  );
});

test("workspaceEmptyTitle учитывает группу активного фильтра", () => {
  assert.equal(workspaceEmptyTitle({ stageKey: "to_be", statusFilter: "done" }), "Нет веток по фильтру TO BE");
  assert.equal(workspaceEmptyTitle({ stageKey: "as_is", statusFilter: "all" }), "Нет веток по фильтру AS IS");
  assert.equal(workspaceEmptyTitle({ stageKey: "", statusFilter: "done" }), "Нет веток по фильтру статуса");
  assert.equal(workspaceEmptyTitle({ stageKey: "", statusFilter: "all" }), "Нет веток по фильтру контура");
});

test("stageLabel uppercases known stages", () => {
  assert.equal(stageLabel(STAGE_AS_IS), "AS IS");
  assert.equal(stageLabel(STAGE_TO_BE), "TO BE");
  assert.equal(stageLabel("junk"), "JUNK");
});
