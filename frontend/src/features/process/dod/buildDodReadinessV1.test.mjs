import assert from "node:assert/strict";
import test from "node:test";
import { buildDodReadinessV1 } from "./buildDodReadinessV1.js";

function baseSnapshot() {
  return {
    bpmn_nodes: [
      { bpmn_id: "Start_1", type: "startEvent" },
      { bpmn_id: "Task_1", type: "task" },
      { bpmn_id: "GW_1", type: "exclusiveGateway" },
      { bpmn_id: "Task_2", type: "task" },
      { bpmn_id: "End_1", type: "endEvent" },
    ],
    bpmn_flows: [
      { flow_id: "F1", from_id: "Start_1", to_id: "Task_1", tier: "P0" },
      { flow_id: "F2", from_id: "Task_1", to_id: "GW_1", tier: "P0" },
      { flow_id: "F3", from_id: "GW_1", to_id: "Task_2", tier: "P0" },
      { flow_id: "F4", from_id: "Task_2", to_id: "End_1", tier: "P1" },
    ],
    quality: {
      orphan_bpmn_nodes: [],
      dead_end_bpmn_nodes: [],
      gateway_unjoined: [],
    },
  };
}

test("buildDodReadinessV1 marks all 6 sections as real (including readiness_artifacts)", () => {
  const result = buildDodReadinessV1({
    draft: {
      session_id: "sess_1",
      title: "Линия супов",
      bpmn_meta: {
        flow_meta: { F1: { tier: "P0" }, F2: { tier: "P0" }, F3: { tier: "P0" }, F4: { tier: "P1" } },
        node_path_meta: {
          Start_1: { paths: ["P0"], sequence_key: "primary" },
          Task_1: { paths: ["P0"], sequence_key: "primary" },
          Task_2: { paths: ["P1"], sequence_key: "mitigated_1" },
        },
        auto_pass_v1: { status: "done" },
      },
    },
    dodSnapshot: baseSnapshot(),
    autoPassPrecheck: { canRun: true, reason: "", code: "" },
    autoPassJobState: { status: "done" },
    coverageMatrix: {
      summary: {
        total: 3,
        missingNotes: 0,
        missingAiQuestions: 0,
        missingDurationQuality: 0,
      },
    },
  });

  assert.equal(result.version, "dod_readiness_v1");
  assert.equal(result.markers.implementedSections.length, 6);
  assert.equal(result.markers.mockSections.length, 0);

  const realSections = result.sections.filter((row) => row.sourceKind === "real");
  const mockSections = result.sections.filter((row) => row.sourceKind === "mock");
  assert.equal(realSections.length, 6);
  assert.equal(mockSections.length, 0);

  const realIds = realSections.map((row) => row.id).sort();
  assert.deepEqual(realIds, [
    "autopass_execution",
    "paths_sequence",
    "readiness_artifacts",
    "steps_completeness",
    "structure_graph",
    "traceability_audit",
  ]);
});

test("buildDodReadinessV1 emits canonical STR/PATH/EXEC codes and explainability payload", () => {
  const snapshot = baseSnapshot();
  snapshot.quality.dead_end_bpmn_nodes = ["Task_2"];
  const result = buildDodReadinessV1({
    draft: {
      session_id: "sess_2",
      title: "Тест",
      bpmn_meta: {
        flow_meta: { F1: { tier: "P0" }, F2: { tier: "P0" }, F3: { tier: "P0" }, F4: { tier: "P1" } },
        node_path_meta: {
          Start_1: { paths: ["P0"], sequence_key: "primary" },
          Task_1: { paths: ["P0"] },
        },
        auto_pass_v1: { status: "failed" },
      },
    },
    dodSnapshot: snapshot,
    autoPassPrecheck: { canRun: false, reason: "No complete path to EndEvent in main process.", code: "NO_END_PATH" },
    autoPassJobState: { status: "failed", error: "run failed" },
    coverageMatrix: {
      summary: {
        total: 2,
        missingNotes: 2,
        missingAiQuestions: 2,
        missingDurationQuality: 2,
      },
    },
  });

  const allSignals = result.sections.flatMap((section) => section.signals || []).map((signal) => signal.code);
  assert.ok(allSignals.includes("STR_001"));
  assert.ok(allSignals.includes("STR_002"));
  assert.ok(allSignals.includes("STR_003"));
  assert.ok(allSignals.includes("STR_004"));
  assert.ok(allSignals.includes("PATH_001"));
  assert.ok(allSignals.includes("PATH_002"));
  assert.ok(allSignals.includes("PATH_003"));
  assert.ok(allSignals.includes("EXEC_001"));
  assert.ok(allSignals.includes("EXEC_002"));
  assert.ok(allSignals.includes("STEP_001"));
  assert.ok(allSignals.includes("STEP_002"));
  assert.ok(allSignals.includes("STEP_003"));
  assert.ok(allSignals.includes("STEP_004"));
  assert.ok(allSignals.includes("STEP_005"));
  assert.ok(allSignals.includes("TRACE_001"));
  assert.ok(allSignals.includes("TRACE_002"));
  assert.ok(allSignals.includes("TRACE_003"));
  assert.ok(allSignals.includes("TRACE_004"));

  assert.ok(result.blockers.some((row) => row.id === "STR_003"));
  assert.ok(result.blockers.some((row) => row.id === "PATH_002"));
  assert.ok(result.blockers.some((row) => row.id === "EXEC_001"));
  assert.ok(result.blockers.some((row) => row.id === "EXEC_002"));

  const blocker = result.blockers.find((row) => row.id === "PATH_002");
  assert.ok(blocker?.explainability?.whatChecked);
  assert.ok(blocker?.explainability?.howCalculated);
  assert.ok(blocker?.explainability?.source);
  assert.ok(blocker?.explainability?.impact);
  assert.equal(blocker?.isBlocking, true);

  const stepIssues = result.gaps.filter((row) => String(row.id || "").startsWith("STEP_"));
  assert.ok(stepIssues.length > 0);
  assert.equal(stepIssues.every((row) => row.isBlocking === false), true);
});

test("buildDodReadinessV1 derives mixed traceability section with TRACE_001..TRACE_004", () => {
  const result = buildDodReadinessV1({
    draft: {
      id: "sess_trace_1",
      session_id: "sess_trace_1",
      project_id: "proj_1",
      org_id: "org_1",
      created_at: 100,
      updated_at: 200,
      created_by: "user_1",
      updated_by: "user_1",
      interview: {
        steps: [{ id: "s1", node_id: "Task_1" }],
        transitions: [{ id: "tr_bad", from_node_id: "Task_1", to_node_id: "Task_missing" }],
      },
      questions: [{ id: "q_bad", node_id: "Task_missing", status: "open" }],
      bpmn_meta: {
        flow_meta: { F1: { tier: "P0" }, F2: { tier: "P0" }, F3: { tier: "P0" }, F4: { tier: "P1" } },
        node_path_meta: {
          Start_1: { paths: ["P0"], sequence_key: "primary" },
          Task_1: { paths: ["P0"], sequence_key: "primary" },
        },
        auto_pass_v1: { status: "done" },
      },
    },
    dodSnapshot: {
      ...baseSnapshot(),
      interview_steps: [{ step_id: "s1", bpmn_ref: "Task_1", ai: { questionsCount: 0 }, notes: { elementCount: 0 } }],
    },
    autoPassPrecheck: { canRun: true, reason: "", code: "" },
    autoPassJobState: { status: "done" },
    coverageMatrix: { summary: { total: 1, missingNotes: 1, missingAiQuestions: 1, missingDurationQuality: 0 } },
    context: {
      orgId: "org_1",
      workspaceId: "ws_1",
      projectId: "proj_1",
      sessionId: "sess_trace_1",
      folderId: "",
    },
  });

  const traceSection = result.sections.find((row) => row.id === "traceability_audit");
  assert.equal(traceSection?.sourceKind, "real");
  assert.equal(traceSection?.type, "Смешанный");
  const traceCodes = (traceSection?.signals || []).map((signal) => signal.code).sort();
  assert.deepEqual(traceCodes, ["TRACE_001", "TRACE_002", "TRACE_003", "TRACE_004"]);

  assert.ok(result.blockers.some((row) => row.id === "TRACE_004"));
  const trace002 = (traceSection?.signals || []).find((signal) => signal.code === "TRACE_002");
  assert.equal(trace002?.isBlocking, false);
});

test("buildDodReadinessV1 emits ART_001..ART_007 artifact signals with kind classification", () => {
  const result = buildDodReadinessV1({
    draft: {
      session_id: "sess_art_1",
      title: "Artifact test",
      bpmn_xml: "<definitions/>",
      bpmn_meta: {
        flow_meta: { F1: { tier: "P0" } },
        node_path_meta: { Start_1: { paths: ["P0"], sequence_key: "primary" } },
        auto_pass_v1: { status: "done" },
        drawio: { doc_xml: "<svg/>" },
      },
      interview: { steps: [{ id: "s1", node_id: "Task_1" }] },
    },
    dodSnapshot: baseSnapshot(),
    autoPassPrecheck: { canRun: true, reason: "", code: "" },
    autoPassJobState: { status: "done" },
    coverageMatrix: { summary: { total: 1, missingNotes: 0, missingAiQuestions: 0, missingDurationQuality: 0 } },
  });

  const artSection = result.sections.find((row) => row.id === "readiness_artifacts");
  assert.equal(artSection?.sourceKind, "real");
  assert.equal(artSection?.type, "Мягкий");

  const artSignals = artSection?.signals || [];
  const artCodes = artSignals.map((s) => s.code).sort();
  assert.deepEqual(artCodes, ["ART_001", "ART_002", "ART_003", "ART_004", "ART_005", "ART_006", "ART_007"]);

  const byCode = Object.fromEntries(artSignals.map((s) => [s.code, s]));

  assert.equal(byCode.ART_001.kind, "canonical_supporting");
  assert.equal(byCode.ART_001.isCanonical, true);
  assert.equal(byCode.ART_002.kind, "canonical_supporting");
  assert.equal(byCode.ART_003.kind, "canonical_supporting");
  assert.equal(byCode.ART_006.kind, "canonical_supporting");

  assert.equal(byCode.ART_004.kind, "secondary");
  assert.equal(byCode.ART_004.isCanonical, false);
  assert.equal(byCode.ART_005.kind, "secondary");

  assert.equal(byCode.ART_007.kind, "non_canonical");
  assert.equal(byCode.ART_007.isCanonical, false);
  assert.equal(byCode.ART_007.pass, true);

  for (const signal of artSignals) {
    assert.equal(signal.isBlocking, false, `${signal.code} must not be blocking`);
  }

  const art001Explain = byCode.ART_001.explainability;
  assert.ok(art001Explain?.whatChecked);
  assert.ok(art001Explain?.howCalculated);
  assert.ok(art001Explain?.source);
  assert.ok(art001Explain?.impact);
  assert.equal(art001Explain?.isCanonical, true);
  assert.equal(art001Explain?.kind, "canonical_supporting");
});

test("readiness_v1 unified contract: top-level shape, overall, counts, meta, section aliases", () => {
  const snapshot = baseSnapshot();
  snapshot.quality.dead_end_bpmn_nodes = ["Task_2"];
  const result = buildDodReadinessV1({
    draft: {
      session_id: "sess_contract_1",
      title: "Contract test",
      bpmn_meta: {
        flow_meta: { F1: { tier: "P0" }, F2: { tier: "P0" }, F3: { tier: "P0" }, F4: { tier: "P1" } },
        node_path_meta: {
          Start_1: { paths: ["P0"], sequence_key: "primary" },
          Task_1: { paths: ["P0"], sequence_key: "primary" },
        },
        auto_pass_v1: { status: "done" },
      },
    },
    dodSnapshot: snapshot,
    autoPassPrecheck: { canRun: true, reason: "", code: "" },
    autoPassJobState: { status: "done" },
    coverageMatrix: { summary: { total: 2, missingNotes: 1, missingAiQuestions: 1, missingDurationQuality: 0 } },
    context: { orgId: "org_1", workspaceId: "ws_1", projectId: "proj_1", sessionId: "sess_contract_1", folderId: "f_1" },
  });

  assert.equal(result.version, "dod_readiness_v1");
  assert.equal(result.sessionId, "sess_contract_1");
  assert.ok(result.computedAt);
  assert.ok(result.generatedAtIso);

  assert.ok(result.sourceSummary);
  assert.equal(result.sourceSummary.sectionsReal, 6);
  assert.equal(result.sourceSummary.sectionsMock, 0);
  assert.ok(result.sourceSummary.signalsTotal > 0);

  assert.ok(result.overall);
  assert.equal(typeof result.overall.score, "number");
  assert.ok(["blocked", "ready", "draft", "incomplete"].includes(result.overall.status));
  assert.equal(typeof result.overall.isBlocked, "boolean");

  assert.ok(result.counts);
  assert.equal(typeof result.counts.hardBlockers, "number");
  assert.equal(typeof result.counts.softGaps, "number");
  assert.equal(typeof result.counts.infos, "number");
  assert.equal(typeof result.counts.sections, "number");
  assert.equal(typeof result.counts.signals, "number");

  assert.ok(result.profiles);
  assert.equal(typeof result.profiles.document, "number");
  assert.equal(typeof result.profiles.automation, "number");
  assert.equal(typeof result.profiles.audit, "number");

  assert.ok(result.hardBlockers);
  assert.ok(result.softGaps);
  assert.equal(result.hardBlockers.length, result.blockers.length);
  assert.equal(result.softGaps.length, result.gaps.length);

  assert.ok(result.meta);
  assert.equal(result.meta.contractVersion, "readiness_v1");
  assert.equal(result.meta.sessionId, "sess_contract_1");
  assert.equal(result.meta.orgId, "org_1");
  assert.equal(result.meta.isGate, false);

  for (const section of result.sections) {
    assert.ok(section.code, `section ${section.id} must have code`);
    assert.equal(section.code, section.id);
    assert.ok(section.label, `section ${section.id} must have label`);
    assert.equal(section.label, section.section);
    assert.ok(["hard", "soft", "mixed"].includes(section.kind), `section ${section.id} kind must be hard/soft/mixed`);
    assert.ok(Array.isArray(section.parameters), `section ${section.id} must have parameters[]`);
    assert.equal(section.parameters, section.signals);
  }

  if (result.blockers.length > 0) {
    const blocker = result.blockers[0];
    assert.ok(blocker.code);
    assert.ok(blocker.sectionCode);
    assert.ok(blocker.label);
    assert.ok(blocker.message);
    assert.equal(typeof blocker.isBlocking, "boolean");
    assert.ok(blocker.explainability);
    assert.equal(typeof blocker.recommendedAction, "string");
    assert.equal(typeof blocker.potentialScoreUplift, "string");
  }

  if (result.overall.isBlocked) {
    assert.equal(result.overall.status, "blocked");
    assert.equal(result.summary.overallStatus, "blocked");
  }
});
