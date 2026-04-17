import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTelemetryCorrelationPivotFilters,
  buildTelemetryErrorEventsParams,
  buildTelemetrySearchPatch,
  parseTelemetryFiltersFromSearch,
  telemetryFilterValidation,
} from "./adminTelemetryQuery.js";

test("parseTelemetryFiltersFromSearch: reads URL filter state with safe defaults", () => {
  const filters = parseTelemetryFiltersFromSearch("?request_id=req_1&session_id=sess_1&correlation_id=corr_1&limit=250&order=desc&occurred_from=bad&event_id=evt_1");

  assert.equal(filters.request_id, "req_1");
  assert.equal(filters.session_id, "sess_1");
  assert.equal(filters.correlation_id, "corr_1");
  assert.equal(filters.limit, 100);
  assert.equal(filters.order, "desc");
  assert.equal(filters.occurred_from, "");
  assert.equal(filters.event_id, "evt_1");
});

test("buildTelemetryErrorEventsParams: emits retrieval endpoint params without UI-only event_id", () => {
  const params = buildTelemetryErrorEventsParams({
    request_id: "req_1",
    correlation_id: "corr_1",
    source: "frontend",
    severity: "error",
    occurred_from: "100",
    occurred_to: "200",
    limit: "25",
    order: "desc",
    event_id: "evt_ui_only",
  });

  assert.deepEqual(params, {
    limit: "25",
    order: "desc",
    request_id: "req_1",
    correlation_id: "corr_1",
    source: "frontend",
    severity: "error",
    occurred_from: "100",
    occurred_to: "200",
  });
});

test("buildTelemetrySearchPatch: omits default limit/order from URL state", () => {
  const patch = buildTelemetrySearchPatch({ request_id: "req_1", correlation_id: "corr_1", limit: 50, order: "asc" });

  assert.equal(patch.request_id, "req_1");
  assert.equal(patch.correlation_id, "corr_1");
  assert.equal(patch.limit, "");
  assert.equal(patch.order, "");
});

test("buildTelemetryCorrelationPivotFilters: keeps org/limit/order and clears conflicting incident filters", () => {
  const next = buildTelemetryCorrelationPivotFilters({
    session_id: "sess_1",
    request_id: "req_1",
    correlation_id: "",
    runtime_id: "rt_1",
    org_id: "org_main",
    event_type: "backend_exception",
    source: "backend",
    severity: "error",
    occurred_from: "100",
    occurred_to: "200",
    limit: "25",
    order: "desc",
    event_id: "evt_1",
  }, "corr_incident");

  assert.deepEqual(next, {
    session_id: "",
    request_id: "",
    correlation_id: "corr_incident",
    user_id: "",
    org_id: "org_main",
    runtime_id: "",
    event_type: "",
    source: "",
    severity: "",
    occurred_from: "",
    occurred_to: "",
    limit: 25,
    order: "desc",
    event_id: "",
  });
});

test("telemetryFilterValidation: reports invalid timestamp and limit without throwing", () => {
  const errors = telemetryFilterValidation({ occurred_to: "abc", limit: 500 });

  assert.equal(errors.length, 2);
  assert.match(errors.join(";"), /occurred_to/);
  assert.match(errors.join(";"), /limit/);
});
