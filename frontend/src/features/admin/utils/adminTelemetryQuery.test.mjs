import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTelemetryErrorEventsParams,
  buildTelemetrySearchPatch,
  parseTelemetryFiltersFromSearch,
  telemetryFilterValidation,
} from "./adminTelemetryQuery.js";

test("parseTelemetryFiltersFromSearch: reads URL filter state with safe defaults", () => {
  const filters = parseTelemetryFiltersFromSearch("?request_id=req_1&session_id=sess_1&limit=250&order=desc&occurred_from=bad&event_id=evt_1");

  assert.equal(filters.request_id, "req_1");
  assert.equal(filters.session_id, "sess_1");
  assert.equal(filters.limit, 100);
  assert.equal(filters.order, "desc");
  assert.equal(filters.occurred_from, "");
  assert.equal(filters.event_id, "evt_1");
});

test("buildTelemetryErrorEventsParams: emits retrieval endpoint params without UI-only event_id", () => {
  const params = buildTelemetryErrorEventsParams({
    request_id: "req_1",
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
    source: "frontend",
    severity: "error",
    occurred_from: "100",
    occurred_to: "200",
  });
});

test("buildTelemetrySearchPatch: omits default limit/order from URL state", () => {
  const patch = buildTelemetrySearchPatch({ request_id: "req_1", limit: 50, order: "asc" });

  assert.equal(patch.request_id, "req_1");
  assert.equal(patch.limit, "");
  assert.equal(patch.order, "");
});

test("telemetryFilterValidation: reports invalid timestamp and limit without throwing", () => {
  const errors = telemetryFilterValidation({ occurred_to: "abc", limit: 500 });

  assert.equal(errors.length, 2);
  assert.match(errors.join(";"), /occurred_to/);
  assert.match(errors.join(";"), /limit/);
});
