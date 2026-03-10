import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

import {
  buildScenarioSequenceForReport,
  buildPathReportRequest,
  buildReportBuildDebug,
  decorateReportVersionsWithActuality,
  normalizeReportMarkdown,
  resolveStepIdForRecommendation,
} from "./pathReport.js";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

test("steps_hash is stable for identical meaningful manual steps", async () => {
  const interviewA = {
    steps: [
      {
        id: "s_b",
        order_index: 2,
        action: "Cook",
        lane_key: "lane_hot",
        lane_name: "Hot line",
        bpmn_ref: "Task_Cook",
        work_duration_sec: 420,
        wait_duration_sec: 60,
        comment: "Keep 82C",
        ui_selected: true,
      },
      {
        id: "s_a",
        order_index: 1,
        action: "Prep",
        lane_key: "lane_prep",
        lane_name: "Prep",
        bpmn_ref: "Task_Prep",
        work_duration_sec: 180,
        wait_duration_sec: 0,
        comment: "",
        random_ts: 999,
      },
    ],
    path_spec: {
      mode: "manual",
      steps: [
        { step_id: "s_b", order_index: 2, title: "Cook", lane_id: "lane_hot", bpmn_ref: "Task_Cook", work_duration_sec: 420, wait_duration_sec: 60 },
        { step_id: "s_a", order_index: 1, title: "Prep", lane_id: "lane_prep", bpmn_ref: "Task_Prep", work_duration_sec: 180, wait_duration_sec: 0 },
      ],
    },
  };

  const interviewB = {
    steps: [
      {
        id: "s_a",
        order_index: 1,
        action: "Prep",
        lane_key: "lane_prep",
        lane_name: "Prep",
        bpmn_ref: "Task_Prep",
        work_duration_sec: 180,
        wait_duration_sec: 0,
        local_ui_only: "x",
      },
      {
        id: "s_b",
        order_index: 2,
        action: "Cook",
        lane_key: "lane_hot",
        lane_name: "Hot line",
        bpmn_ref: "Task_Cook",
        work_duration_sec: 420,
        wait_duration_sec: 60,
        comment: "Keep 82C",
        updated_at: "2026-02-26T10:10:10Z",
      },
    ],
    path_spec: {
      mode: "manual",
      steps: [
        { step_id: "s_a", order_index: 1, title: "Prep", lane_id: "lane_prep", bpmn_ref: "Task_Prep", work_duration_sec: 180, wait_duration_sec: 0 },
        { step_id: "s_b", order_index: 2, title: "Cook", lane_id: "lane_hot", bpmn_ref: "Task_Cook", work_duration_sec: 420, wait_duration_sec: 60 },
      ],
    },
  };

  const reqA = await buildPathReportRequest({
    sessionId: "sid_1",
    pathId: "manual_path",
    pathName: "Manual Path",
    interviewData: interviewA,
    generatedAt: "2026-02-26T00:00:00.000Z",
  });
  const reqB = await buildPathReportRequest({
    sessionId: "sid_1",
    pathId: "manual_path",
    pathName: "Manual Path",
    interviewData: interviewB,
    generatedAt: "2026-02-26T00:00:00.000Z",
  });

  assert.equal(reqA.steps_hash, reqB.steps_hash);
});

test("steps_hash does not change when only ui state changes", async () => {
  const interviewA = {
    steps: [
      { id: "s1", order_index: 1, action: "Prep", lane_key: "lane_prep", bpmn_ref: "Task_Prep", work_duration_sec: 120, wait_duration_sec: 0, ui_expanded: true },
    ],
    path_spec: {
      mode: "manual",
      steps: [{ step_id: "s1", order_index: 1, title: "Prep", lane_id: "lane_prep", bpmn_ref: "Task_Prep", work_duration_sec: 120, wait_duration_sec: 0 }],
    },
    ui_state: { selected_row: "s1", panel_open: true },
  };
  const interviewB = {
    steps: [
      { id: "s1", order_index: 1, action: "Prep", lane_key: "lane_prep", bpmn_ref: "Task_Prep", work_duration_sec: 120, wait_duration_sec: 0, ui_expanded: false, ui_temp_color: "red" },
    ],
    path_spec: {
      mode: "manual",
      steps: [{ step_id: "s1", order_index: 1, title: "Prep", lane_id: "lane_prep", bpmn_ref: "Task_Prep", work_duration_sec: 120, wait_duration_sec: 0 }],
    },
    ui_state: { selected_row: "", panel_open: false },
  };

  const reqA = await buildPathReportRequest({
    sessionId: "sid_ui",
    pathId: "manual_path",
    pathName: "Manual Path",
    interviewData: interviewA,
    generatedAt: "2026-02-26T00:00:00.000Z",
  });
  const reqB = await buildPathReportRequest({
    sessionId: "sid_ui",
    pathId: "manual_path",
    pathName: "Manual Path",
    interviewData: interviewB,
    generatedAt: "2026-02-26T00:00:00.000Z",
  });

  assert.equal(reqA.steps_hash, reqB.steps_hash);
});

test("report payload steps are strictly ordered by order_index", async () => {
  const interview = {
    steps: [
      { id: "s3", order_index: 3, action: "C", lane_name: "Lane C", bpmn_ref: "Task_C", work_duration_sec: 300, wait_duration_sec: 30 },
      { id: "s1", order_index: 1, action: "A", lane_name: "Lane A", bpmn_ref: "Task_A", work_duration_sec: 120, wait_duration_sec: 0 },
      { id: "s2", order_index: 2, action: "B", lane_name: "Lane B", bpmn_ref: "Task_B", work_duration_sec: 240, wait_duration_sec: 10 },
    ],
    path_spec: {
      mode: "manual",
      steps: [
        { step_id: "s3", order_index: 3, title: "C", lane_id: "lane_c", bpmn_ref: "Task_C", work_duration_sec: 300, wait_duration_sec: 30 },
        { step_id: "s1", order_index: 1, title: "A", lane_id: "lane_a", bpmn_ref: "Task_A", work_duration_sec: 120, wait_duration_sec: 0 },
        { step_id: "s2", order_index: 2, title: "B", lane_id: "lane_b", bpmn_ref: "Task_B", work_duration_sec: 240, wait_duration_sec: 10 },
      ],
    },
  };

  const req = await buildPathReportRequest({
    sessionId: "sid_order",
    pathId: "path_order",
    pathName: "Order path",
    interviewData: interview,
    generatedAt: "2026-02-26T00:00:00.000Z",
  });

  assert.deepEqual(
    req.payload.steps.map((s) => Number(s.order_index)),
    [1, 2, 3],
  );
  assert.deepEqual(
    req.payload.steps.map((s) => s.title),
    ["A", "B", "C"],
  );
  assert.ok(req.payload.missing_fields_coverage);
  assert.ok(req.payload.quality_summary);
  assert.equal(Object.prototype.hasOwnProperty.call(req.payload, "bpmn_xml"), false);
});

test("report payload uses active scenario sequence numbering from 1", async () => {
  const interview = {
    steps: [
      { id: "legacy_43", order_index: 43, action: "Звуковой сигнал о новом заказе", lane_name: "Работа сотрудника", bpmn_ref: "Event_0n3sbnt" },
      { id: "legacy_44", order_index: 44, action: "Сотрудник подходит к компьютеру", lane_name: "Работа сотрудника", bpmn_ref: "Activity_01pgxk6" },
      { id: "legacy_45", order_index: 45, action: "Посмотреть состав заказа в ВВ партнер", lane_name: "Работа программы сборки", bpmn_ref: "Activity_0m37490" },
    ],
    path_spec: {
      mode: "manual",
      steps: [
        { step_id: "legacy_43", order_index: 43, title: "Звуковой сигнал о новом заказе", bpmn_ref: "Event_0n3sbnt" },
        { step_id: "legacy_44", order_index: 44, title: "Сотрудник подходит к компьютеру", bpmn_ref: "Activity_01pgxk6" },
        { step_id: "legacy_45", order_index: 45, title: "Посмотреть состав заказа в ВВ партнер", bpmn_ref: "Activity_0m37490" },
      ],
    },
  };

  const req = await buildPathReportRequest({
    sessionId: "sid_scope",
    pathId: "primary",
    pathName: "P0",
    interviewData: interview,
    scenarioSequence: [
      { node_id: "Event_0n3sbnt", title: "Звуковой сигнал о новом заказе", lane_name: "Работа сотрудника" },
      { node_id: "Activity_01pgxk6", title: "Сотрудник подходит к компьютеру", lane_name: "Работа сотрудника" },
      { node_id: "Activity_0m37490", title: "Посмотреть состав заказа в ВВ партнер", lane_name: "Работа программы сборки" },
    ],
    generatedAt: "2026-02-27T00:00:00.000Z",
  });

  assert.deepEqual(
    req.payload.steps.map((s) => Number(s.order_index)),
    [1, 2, 3],
  );
  assert.deepEqual(
    req.payload.steps.map((s) => s.title),
    [
      "Звуковой сигнал о новом заказе",
      "Сотрудник подходит к компьютеру",
      "Посмотреть состав заказа в ВВ партнер",
    ],
  );
});

test("report scenario sequence uses primary gateway branch rows", () => {
  const scenario = {
    sequence: [
      { node_id: "Start_1", title: "Старт" },
      { node_id: "Task_ALT", title: "Альтернатива" },
      { node_id: "Gateway_Main", title: "Проверка" },
      { node_id: "Task_Main", title: "Основной шаг" },
      { node_id: "End_1", title: "Финиш" },
    ],
    rows: [
      { kind: "row_step", row_type: "step", node_id: "Start_1", title: "Старт", lane_name: "Сотрудник" },
      {
        kind: "row_group",
        row_type: "gateway",
        children: [
          {
            kind: "row_branch",
            key: "A",
            label: "Нет",
            is_primary: false,
            children: [
              { kind: "row_step", row_type: "step", node_id: "Task_ALT", title: "Альтернатива", lane_name: "Сотрудник" },
            ],
          },
          {
            kind: "row_branch",
            key: "B",
            label: "Да",
            is_primary: true,
            children: [
              {
                kind: "row_step",
                row_type: "decision",
                node_id: "Gateway_Main",
                title: "Проверка",
                lane_name: "Система",
                decision: { selected_flow_id: "Flow_yes", selected_label: "Да" },
              },
              { kind: "row_step", row_type: "step", node_id: "Task_Main", title: "Основной шаг", lane_name: "Сотрудник" },
            ],
          },
        ],
      },
      { kind: "row_step", row_type: "terminal", node_id: "End_1", title: "Финиш", lane_name: "Система" },
    ],
  };

  const seq = buildScenarioSequenceForReport(scenario);
  assert.deepEqual(
    seq.map((item) => item.node_id),
    ["Start_1", "Gateway_Main", "Task_Main", "End_1"],
  );
  assert.equal(seq[1]?.decision?.selected_flow_id, "Flow_yes");
  assert.equal(seq[1]?.decision?.selected_label, "Да");
});

test("report scenario sequence falls back to scenario.sequence", () => {
  const seq = buildScenarioSequenceForReport({
    sequence: [
      { node_id: "S1", title: "Шаг 1" },
      { node_id: "S2", title: "Шаг 2" },
    ],
    rows: [],
  });
  assert.deepEqual(
    seq.map((item) => item.node_id),
    ["S1", "S2"],
  );
});

test("step recommendation resolves to correct step id for table highlight", () => {
  const steps = [
    { id: "step_10", order_index: 10, action: "Pack" },
    { id: "step_20", order_index: 20, action: "Dispatch" },
  ];

  assert.equal(
    resolveStepIdForRecommendation({ scope: "step", order_index: 20 }, steps),
    "step_20",
  );
  assert.equal(
    resolveStepIdForRecommendation({ scope: "global", text: "..." }, steps),
    "",
  );
});

test("report versions are marked actual/stale by steps_hash", () => {
  const versions = [
    { id: "r3", version: 3, steps_hash: "ccc" },
    { id: "r2", version: 2, steps_hash: "bbb" },
    { id: "r1", version: 1, steps_hash: "bbb" },
  ];
  const marked = decorateReportVersionsWithActuality(versions, "bbb");
  assert.deepEqual(
    marked.map((row) => ({ id: row.id, is_actual: row.is_actual, is_latest_actual: row.is_latest_actual })),
    [
      { id: "r3", is_actual: false, is_latest_actual: false },
      { id: "r2", is_actual: true, is_latest_actual: true },
      { id: "r1", is_actual: true, is_latest_actual: false },
    ],
  );
});

test("report build debug marks complete path on EndEvent", () => {
  const debug = buildReportBuildDebug({
    selectedScenarioLabel: "P0 Ideal",
    pathIdUsed: "primary",
    scenarioRaw: { warnings: [] },
    scenarioSequence: [
      { node_id: "Start_1", title: "Start" },
      { node_id: "End_1", title: "End" },
    ],
    steps: [
      { order_index: 1, title: "Start", bpmn_ref: "Start_1" },
      { order_index: 2, title: "End", bpmn_ref: "End_1" },
    ],
    graphModel: {
      nodesById: {
        Start_1: { id: "Start_1", type: "startEvent" },
        End_1: { id: "End_1", type: "endEvent" },
      },
      outgoingByNode: {
        Start_1: [{ id: "Flow_1", targetId: "End_1" }],
        End_1: [],
      },
      incomingByNode: {
        Start_1: [],
        End_1: [{ id: "Flow_1", sourceId: "Start_1" }],
      },
    },
    dodSnapshot: {},
  });
  assert.equal(debug.stop_reason, "OK_COMPLETE");
  assert.equal(debug.stop_at_bpmn_id, "");
});

test("report build debug marks dead end path", () => {
  const debug = buildReportBuildDebug({
    selectedScenarioLabel: "P0 Ideal",
    pathIdUsed: "primary",
    scenarioRaw: { warnings: [] },
    scenarioSequence: [
      { node_id: "Task_1", title: "Task" },
    ],
    steps: [
      { order_index: 1, title: "Task", bpmn_ref: "Task_1" },
    ],
    graphModel: {
      nodesById: {
        Task_1: { id: "Task_1", type: "task" },
      },
      outgoingByNode: {
        Task_1: [],
      },
      incomingByNode: {
        Task_1: [{ id: "Flow_prev", sourceId: "Start_1" }],
      },
    },
    dodSnapshot: {
      quality: {
        dead_end_bpmn_nodes: ["Task_1"],
      },
    },
  });
  assert.equal(debug.stop_reason, "DEAD_END_NODE");
  assert.equal(debug.stop_at_bpmn_id, "Task_1");
});

test("report build debug marks missing required binding", () => {
  const debug = buildReportBuildDebug({
    sessionId: "sid_debug",
    selectedScenarioLabel: "P0 Ideal",
    pathIdUsed: "primary",
    scenarioRaw: { warnings: [] },
    scenarioSequence: [
      { node_id: "Task_1", title: "Task" },
    ],
    steps: [
      { order_index: 1, title: "Task", bpmn_ref: "" },
    ],
    graphModel: {},
    dodSnapshot: {},
  });
  assert.equal(debug.stop_reason, "MISSING_REQUIRED_BINDING");
  assert.equal(debug.session_id, "sid_debug");
});

test("report build debug marks filtered out when outgoing leaves scenario subset", () => {
  const debug = buildReportBuildDebug({
    sessionId: "sid_debug",
    selectedScenarioLabel: "P0 Ideal",
    pathIdUsed: "primary",
    scenarioRaw: { warnings: [] },
    scenarioSequence: [
      { node_id: "Gateway_A", title: "Parallel split" },
    ],
    steps: [
      { order_index: 1, title: "Parallel split", bpmn_ref: "Gateway_A" },
    ],
    graphModel: {
      nodesById: {
        Gateway_A: { id: "Gateway_A", type: "parallelGateway" },
        Task_B: { id: "Task_B", type: "task" },
      },
      outgoingByNode: {
        Gateway_A: [{ id: "Flow_1", targetId: "Task_B" }],
      },
      incomingByNode: {
        Gateway_A: [{ id: "Flow_prev", sourceId: "Task_prev" }],
      },
    },
    dodSnapshot: {},
  });
  assert.equal(debug.stop_reason, "FILTERED_OUT");
  assert.equal(debug.stop_at_bpmn_id, "Gateway_A");
});

test("normalizeReportMarkdown extracts markdown from json text", () => {
  const raw = `\`\`\`json
{
  "report_markdown": "## Анализ\\n- Путь: P0"
}
\`\`\``;
  const markdown = normalizeReportMarkdown(raw, "");
  assert.equal(markdown, "## Анализ\n- Путь: P0");
});

test("normalizeReportMarkdown salvages invalid json-like text", () => {
  const raw = `{
  "report_markdown": "## Анализ
- Критерий: "готово"
- Путь: P0"
}`;
  const markdown = normalizeReportMarkdown(raw, "");
  assert.equal(markdown.includes("Критерий: \"готово\""), true);
  assert.equal(markdown.includes("- Путь: P0"), true);
});

test("normalizeReportMarkdown builds fallback markdown from normalized payload when raw is json blob", () => {
  const raw = "{\"title\":\"X\"}";
  const markdown = normalizeReportMarkdown(raw, "", {
    title: "Fallback",
    summary: ["S1"],
    kpis: {
      steps_count: 3,
      work_total_sec: 120,
      wait_total_sec: 30,
      total_sec: 150,
    },
  });
  assert.equal(markdown.includes("## Fallback"), true);
  assert.equal(markdown.includes("- S1"), true);
  assert.equal(markdown.includes("- steps_count: 3"), true);
});
