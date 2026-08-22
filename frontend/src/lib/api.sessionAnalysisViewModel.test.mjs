import test from "node:test";
import assert from "node:assert/strict";

import { apiGetSessionAnalysisViewModel } from "./api.js";

test("apiGetSessionAnalysisViewModel parses unified envelope and preserves all fields", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({
          ok: true,
          session_id: "s1",
          session_title: "Test Session",
          project_id: "p1",
          project_title: "Test Project",
          workspace_id: "w1",
          analysis: {
            product_actions: {
              rows: [
                { registry_id: "s1::a1", product_name: "Карта", completeness: "complete", step_id: "step_1" },
                { registry_id: "s1::a2", product_name: "", completeness: "incomplete", step_id: "step_1" },
              ],
              summary: { total: 2, complete: 1, incomplete: 1 },
              filter_options: {
                product_groups: ["Группа"],
                products: ["Карта"],
                action_types: ["тип"],
                stages: ["этап"],
                object_categories: ["кат"],
                roles: ["Роль"],
              },
              applied_filters: {},
              metrics: { total_rows: 2, complete: 1, incomplete: 1 },
              empty_state: { kind: "not_empty", scope: "session", message_key: "registry.empty.not_empty" },
              source_state: { source: "process_analysis_session_view_model", interview_loaded: true, bpmn_elements_count: 3 },
            },
            derived: {
              step_action_counts: { step_1: 2 },
              process_metrics: {
                time: { active_min: 10, wait_min: 2, lead_min: 12, mainline_min: 10, throughput_steps_per_hour: 5.0 },
                counts: { steps_total: 2, steps_bound_to_bpmn: 2, tiers: { P0: 2, P1: 0, P2: 0, None: 0 } },
                coverage: { bind_percent: 100, ai: { total: 0, done: 0, open: 0, step_coverage_percent: 0 }, boundaries: { filled: 2, total: 5, percent: 40 } },
                distributions: { by_type: [], by_lane: [], by_subprocess: [] },
                top_waits: [],
                extremes: { max_duration_step: null, max_wait_step: null },
                exceptions: { count: 0, add_min_total: 0 },
                quality: { errors_total: 0, warnings_total: 0, items: [] },
                path_metrics: { steps_count: 2, work_time_total_sec: 600, wait_time_total_sec: 120, total_time_sec: 720 },
                source_state: { source: "process_analysis_read_model", version: "v1", computed_at: 1710000000, diagram_state_version: 1 },
              },
            },
          },
          interview_state: { status: "in_progress", stage: "interview", updated_at: 1715600000 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const out = await apiGetSessionAnalysisViewModel("s1");

    assert.equal(out.ok, true);
    assert.match(String(calls[0]?.url || ""), /\/api\/sessions\/s1\/analysis\/view-model$/);
    assert.equal(out.session_id, "s1");
    assert.equal(out.session_title, "Test Session");
    assert.equal(out.project_id, "p1");
    assert.equal(out.project_title, "Test Project");
    assert.equal(out.workspace_id, "w1");
    assert.equal(out.analysis.product_actions.rows.length, 2);
    assert.equal(out.analysis.product_actions.summary.total, 2);
    assert.equal(out.analysis.product_actions.metrics.total_rows, 2);
    assert.deepEqual(out.analysis.product_actions.filter_options.products, ["Карта"]);
    assert.equal(out.analysis.product_actions.empty_state.kind, "not_empty");
    assert.equal(out.analysis.product_actions.source_state.interview_loaded, true);
    assert.deepEqual(out.analysis.derived.step_action_counts, { step_1: 2 });
    assert.equal(out.analysis.derived.process_metrics.time.active_min, 10);
    assert.equal(out.analysis.derived.process_metrics.counts.steps_total, 2);
    assert.equal(out.interview_state.status, "in_progress");
    assert.equal(out.interview_state.stage, "interview");
    assert.equal(out.interview_state.updated_at, 1715600000);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiGetSessionAnalysisViewModel handles error response", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ ok: false, error: "not found", status: 404 }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );

    const out = await apiGetSessionAnalysisViewModel("missing");
    assert.equal(out.ok, false);
    assert.equal(out.status, 404);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiGetSessionAnalysisViewModel validates missing session_id", async () => {
  const out = await apiGetSessionAnalysisViewModel("");
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing session_id");
});

test("apiGetSessionAnalysisViewModel keeps backward compatibility when backend omits new fields", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        ok: true,
        session_id: "s1",
        session_title: "Test",
        analysis: {
          product_actions: {
            rows: [],
          },
        },
        interview_state: {},
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );

    const out = await apiGetSessionAnalysisViewModel("s1");
    assert.equal(out.ok, true);
    assert.deepEqual(out.analysis.product_actions.rows, []);
    assert.deepEqual(out.analysis.product_actions.summary, {});
    assert.deepEqual(out.analysis.product_actions.filter_options, {});
    assert.deepEqual(out.analysis.product_actions.metrics, {});
    assert.deepEqual(out.analysis.product_actions.empty_state, {});
    assert.deepEqual(out.analysis.product_actions.source_state, {});
    assert.deepEqual(out.analysis.derived.step_action_counts, {});
  } finally {
    globalThis.fetch = prevFetch;
  }
});
