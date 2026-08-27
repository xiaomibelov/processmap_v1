import test from "node:test";
import assert from "node:assert/strict";

import {
  ENDPOINT_CHECK_DEFAULT_FILTER,
  ENDPOINT_CHECK_FILTER_ALL,
  ENDPOINT_CHECK_FILTER_FAILING,
  ENDPOINT_CHECK_FILTER_FIXED,
  ENDPOINT_CHECK_FILTER_NEW,
  ENDPOINT_CHECK_POLL_INTERVAL_MS,
  buildEndpointCheckSummary,
  buildNotScannedSummary,
  countEndpointCheckFilter,
  endpointCheckDiffGroup,
  endpointCheckDiffLabel,
  filterEndpointCheckResults,
  formatEndpointCheckTransition,
  formatEndpointCheckTs,
  getEndpointCheckEmptyFilterState,
} from "./endpointCheckModel.js";

const RESULTS = [
  { operation_id: "op_ok", method: "get", path: "/api/a", http_status: 200, category: "ok", diff_status: "ok", latency_ms: 12 },
  { operation_id: "op_new", method: "get", path: "/api/b", http_status: 500, category: "http_error", diff_status: "new_error", latency_ms: 34 },
  { operation_id: "op_new_dom", method: "get", path: "/api/c", http_status: 200, category: "domain_error", diff_status: "new_domain_error", latency_ms: 56 },
  { operation_id: "op_still", method: "get", path: "/api/d", http_status: 404, category: "http_error", diff_status: "still_failing", latency_ms: 8 },
  { operation_id: "op_fixed", method: "get", path: "/api/e", http_status: 200, category: "ok", diff_status: "fixed", latency_ms: 21 },
  { operation_id: "op_newep", method: "get", path: "/api/f", http_status: 200, category: "ok", diff_status: "new_endpoint", latency_ms: 5 },
];

test("дефолтный фильтр — «только новые ошибки» (new_error + new_domain_error)", () => {
  assert.equal(ENDPOINT_CHECK_DEFAULT_FILTER, "new");
  const out = filterEndpointCheckResults(RESULTS);
  assert.deepEqual(out.map((r) => r.operation_id), ["op_new", "op_new_dom"]);
});

test("фильтры: все / падающие / починившиеся", () => {
  assert.equal(filterEndpointCheckResults(RESULTS, ENDPOINT_CHECK_FILTER_ALL).length, RESULTS.length);
  assert.deepEqual(
    filterEndpointCheckResults(RESULTS, ENDPOINT_CHECK_FILTER_FAILING).map((r) => r.operation_id),
    ["op_new", "op_new_dom", "op_still"],
  );
  assert.deepEqual(
    filterEndpointCheckResults(RESULTS, ENDPOINT_CHECK_FILTER_FIXED).map((r) => r.operation_id),
    ["op_fixed"],
  );
});

test("фильтр устойчив к мусору: неизвестный фильтр = все, не-массив = пусто", () => {
  assert.equal(filterEndpointCheckResults(RESULTS, "junk").length, RESULTS.length);
  assert.deepEqual(filterEndpointCheckResults(null, ENDPOINT_CHECK_FILTER_NEW), []);
  assert.deepEqual(filterEndpointCheckResults(undefined, ENDPOINT_CHECK_FILTER_NEW), []);
});

test("diff-группы и подписи", () => {
  assert.equal(endpointCheckDiffGroup("new_error"), "new");
  assert.equal(endpointCheckDiffGroup("new_domain_error"), "new");
  assert.equal(endpointCheckDiffGroup("still_failing"), "failing");
  assert.equal(endpointCheckDiffGroup("still_domain_error"), "failing");
  assert.equal(endpointCheckDiffGroup("fixed"), "fixed");
  assert.equal(endpointCheckDiffGroup("domain_fixed"), "fixed");
  assert.equal(endpointCheckDiffGroup("ok"), "ok");
  assert.equal(endpointCheckDiffGroup("new_endpoint"), "other");
  assert.equal(endpointCheckDiffLabel("new_error"), "новая ошибка");
  assert.equal(endpointCheckDiffLabel("still_failing"), "всё ещё падает");
  assert.equal(endpointCheckDiffLabel(""), "—");
});

test("сводка: счётчики диффа, триггер, короткий commit", () => {
  const summary = buildEndpointCheckSummary({
    id: "run_1",
    trigger: "deploy",
    started_at: 1755600000,
    finished_at: 1755600060,
    version: { commit: "68d4c6c2abc", branch: "main", env: "prod" },
    counts: { ok: 40, scanned: 47 },
    diff: { new_error: 2, new_domain_error: 1, still_failing: 3, still_domain_error: 1, fixed: 5, domain_fixed: 1, new_endpoint: 2 },
  });
  assert.equal(summary.hasRun, true);
  assert.equal(summary.ok, 40);
  assert.equal(summary.newErrors, 3);
  assert.equal(summary.stillFailing, 4);
  assert.equal(summary.fixed, 6);
  assert.equal(summary.newEndpoints, 2);
  assert.equal(summary.triggerLabel, "деплой");
  assert.equal(summary.commitShort, "68d4c6c2");
  assert.equal(summary.branch, "main");
  assert.equal(summary.hasNewErrors, true);
});

test("сводка: new_error = 0 → красного бейджа нет", () => {
  const summary = buildEndpointCheckSummary({
    id: "run_2",
    trigger: "manual",
    counts: { ok: 10, scanned: 10 },
    diff: { new_error: 0, new_domain_error: 0, still_failing: 1, fixed: 2 },
  });
  assert.equal(summary.hasNewErrors, false);
  assert.equal(summary.newErrors, 0);
  assert.equal(summary.triggerLabel, "вручную");
});

test("сводка: прогонов не было → честное пустое состояние", () => {
  const empty = buildEndpointCheckSummary(null);
  assert.equal(empty.hasRun, false);
  assert.equal(empty.hasNewErrors, false);
  assert.equal(buildEndpointCheckSummary({}).hasRun, false);
});

test("transition: «был → стал» по diff_status и http_status", () => {
  assert.equal(formatEndpointCheckTransition({ diff_status: "new_error", http_status: 500 }), "ok → 500");
  assert.equal(formatEndpointCheckTransition({ diff_status: "still_failing", http_status: 404 }), "ошибка → 404");
  assert.equal(formatEndpointCheckTransition({ diff_status: "fixed", http_status: 200 }), "ошибка → 200");
  assert.equal(formatEndpointCheckTransition({ diff_status: "new_endpoint", http_status: 200 }), "— → 200");
  assert.equal(formatEndpointCheckTransition({ diff_status: "ok", http_status: 200 }), "200");
});

test("formatEndpointCheckTs: epoch-секунды, ISO-строка, мусор", () => {
  const ts = formatEndpointCheckTs(1755600000);
  assert.match(ts, /\d{2}\.\d{2}\.\d{4}/);
  assert.match(formatEndpointCheckTs("2026-08-19T12:00:00Z"), /\d{2}\.\d{2}\.\d{4}/);
  assert.equal(formatEndpointCheckTs(""), "—");
  assert.equal(formatEndpointCheckTs(null), "—");
  assert.equal(formatEndpointCheckTs("not-a-date"), "—");
  assert.equal(formatEndpointCheckTs(0), "—");
});

test("поллинг 7 сек зафиксирован константой", () => {
  assert.equal(ENDPOINT_CHECK_POLL_INTERVAL_MS, 7000);
});

test("countEndpointCheckFilter считает по фильтру", () => {
  assert.equal(countEndpointCheckFilter(RESULTS, ENDPOINT_CHECK_FILTER_NEW), 2);
  assert.equal(countEndpointCheckFilter(RESULTS, ENDPOINT_CHECK_FILTER_ALL), RESULTS.length);
});

// Форма идентична ответу GET /api/admin/endpoint-check/runs/{run_id}:
// not_scanned: {count, operation_ids}, blind_zone: [{operation_id, method, path, reason}].
const RUN_DETAIL = {
  run: { id: "run_1" },
  results: [],
  not_scanned: { count: 3, operation_ids: ["op_create", "op_delete", "op_patch"] },
  blind_zone: [
    { operation_id: "op_skip", method: "get", path: "/api/skip-op", reason: "skip_operations" },
    { operation_id: "op_unresolved", method: "get", path: "/api/sessions/{id}", reason: "unresolved_id" },
  ],
};

test("buildNotScannedSummary: контрактная форма backend разбирается", () => {
  const out = buildNotScannedSummary(RUN_DETAIL);
  assert.equal(out.mutationsCount, 3);
  assert.deepEqual(out.mutationOperationIds, ["op_create", "op_delete", "op_patch"]);
  assert.equal(out.blindZone.length, 2);
  assert.deepEqual(out.blindZone[0], {
    operationId: "op_skip",
    method: "GET",
    path: "/api/skip-op",
    reason: "skip_operations",
  });
  assert.equal(out.blindZone[1].reason, "unresolved_id");
  assert.equal(out.hasAny, true);
});

test("buildNotScannedSummary: только счётчик мутаций без blind_zone", () => {
  const out = buildNotScannedSummary({ not_scanned: { count: 5, operation_ids: [] } });
  assert.equal(out.mutationsCount, 5);
  assert.deepEqual(out.blindZone, []);
  assert.equal(out.hasAny, true);
});

test("buildNotScannedSummary: пустые и битые данные → блок скрыт", () => {
  assert.equal(buildNotScannedSummary(null).hasAny, false);
  assert.equal(buildNotScannedSummary({}).hasAny, false);
  assert.equal(buildNotScannedSummary({ not_scanned: { count: 0 }, blind_zone: [] }).hasAny, false);
  const junk = buildNotScannedSummary({ not_scanned: "junk", blind_zone: [null, { reason: "" }] });
  assert.equal(junk.mutationsCount, 0);
  assert.deepEqual(junk.blindZone, []);
  assert.equal(junk.hasAny, false);
});

test("getEndpointCheckEmptyFilterState: при 0 новых ошибок предлагает переключиться на Все", () => {
  const rows = [
    { diff_status: "ok" },
    { diff_status: "fixed" },
  ];
  const state = getEndpointCheckEmptyFilterState(rows, ENDPOINT_CHECK_FILTER_NEW);
  assert.equal(state.isEmpty, true);
  assert.equal(state.messageKey, "noNewErrors");
  assert.equal(state.suggestAll, true);
});

test("getEndpointCheckEmptyFilterState: пустой фильтр, но не «новые»", () => {
  const rows = [{ diff_status: "ok" }];
  const state = getEndpointCheckEmptyFilterState(rows, ENDPOINT_CHECK_FILTER_FIXED);
  assert.equal(state.isEmpty, true);
  assert.equal(state.messageKey, "noFilterRows");
  assert.equal(state.suggestAll, true);
});

test("getEndpointCheckEmptyFilterState: нет результатов вообще", () => {
  const state = getEndpointCheckEmptyFilterState([], ENDPOINT_CHECK_FILTER_NEW);
  assert.equal(state.isEmpty, true);
  assert.equal(state.messageKey, "noResults");
  assert.equal(state.suggestAll, false);
});

test("getEndpointCheckEmptyFilterState: есть строки — не пусто", () => {
  const rows = [{ diff_status: "new_error" }];
  const state = getEndpointCheckEmptyFilterState(rows, ENDPOINT_CHECK_FILTER_NEW);
  assert.equal(state.isEmpty, false);
  assert.equal(state.messageKey, "");
});
