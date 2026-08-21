import test from "node:test";
import assert from "node:assert/strict";

import {
  __resetSaveDiagnosticsForTests,
  buildSaveConflictReportContext,
  getSaveDiagnosticsTrail,
  recordSaveDiagnostic,
} from "../saveDiagnosticsTrail.js";
import {
  __resetForTests as __resetTrackerForTests,
  bumpVersion,
  getVersionHistory,
  rollbackVersion,
  setVersion,
} from "../../../lib/casVersionTracker.js";

function resetAll() {
  __resetSaveDiagnosticsForTests();
  __resetTrackerForTests();
}

test("recordSaveDiagnostic хранит события и нормализует детали", () => {
  resetAll();
  const entry = recordSaveDiagnostic("pipeline_start", {
    sid: "s1",
    pipeline: "xml",
    base: 202,
    note: `x${"y".repeat(300)}`,
  });
  assert.equal(entry.type, "pipeline_start");
  assert.equal(entry.sid, "s1");
  assert.equal(entry.base, 202);
  assert.ok(entry.note.length < 300);
  assert.ok(entry.note.endsWith("...[truncated]"));
  assert.ok(Number.isFinite(entry.ts));
  const trail = getSaveDiagnosticsTrail();
  assert.equal(trail.length, 1);
  assert.equal(trail[0].type, "pipeline_start");
});

test("ring buffer обрезает старые события (макс 50)", () => {
  resetAll();
  for (let i = 0; i < 60; i += 1) {
    recordSaveDiagnostic("tick", { i });
  }
  const trail = getSaveDiagnosticsTrail();
  assert.equal(trail.length, 50);
  assert.equal(trail[0].i, 10);
  assert.equal(trail[49].i, 59);
});

test("мутации casVersionTracker попадают в трейл через recorder-hook", () => {
  resetAll();
  setVersion("s1", 202);
  bumpVersion("s1", 203);
  rollbackVersion("s1");
  const types = getSaveDiagnosticsTrail().map((event) => event.type);
  assert.deepEqual(types, ["tracker_set", "tracker_bump", "tracker_rollback"]);
  const trail = getSaveDiagnosticsTrail();
  assert.equal(trail[0].version, 202);
  assert.equal(trail[1].version, 203);
  assert.equal(trail[2].version, 202);
});

test("buildSaveConflictReportContext собирает версии, actor, changed_keys и trail", () => {
  resetAll();
  setVersion("s1", 202);
  recordSaveDiagnostic("pipeline_start", { sid: "s1", pipeline: "xml" });
  const context = buildSaveConflictReportContext({
    sessionId: "s1",
    pipeline: "xml",
    conflict: {
      clientBaseVersion: 202,
      serverCurrentVersion: 203,
      serverLastWrite: {
        actor_user_id: "u1",
        actor_label: "d.belov@automacon.ru",
        at: 1786000000,
        changed_keys: ["bpmn_xml", "bpmn_meta"],
      },
    },
    userReported: true,
  });
  assert.equal(context.pipeline, "xml");
  assert.equal(context.client_base_version, 202);
  assert.equal(context.server_current_version, 203);
  assert.equal(context.tracker_version, 202);
  assert.deepEqual(context.tracker_history, [202]);
  assert.equal(context.actor_label, "d.belov@automacon.ru");
  assert.deepEqual(context.changed_keys, ["bpmn_xml", "bpmn_meta"]);
  assert.equal(context.user_reported, true);
  assert.ok(context.trail.length >= 2);
  assert.equal(context.trail[context.trail.length - 1].type, "pipeline_start");
});

test("buildSaveConflictReportContext переживает пустой conflict и неизвестную сессию", () => {
  resetAll();
  const context = buildSaveConflictReportContext({});
  assert.equal(context.pipeline, "");
  assert.equal(context.client_base_version, null);
  assert.equal(context.server_current_version, null);
  assert.equal(context.tracker_version, null);
  assert.deepEqual(context.tracker_history, []);
  assert.equal(context.user_reported, false);
  assert.deepEqual(context.trail, []);
});

test("getVersionHistory возвращает копию кольца версий", () => {
  resetAll();
  setVersion("s1", 1);
  bumpVersion("s1", 2);
  bumpVersion("s1", 3);
  assert.deepEqual(getVersionHistory("s1"), [1, 2, 3]);
  assert.deepEqual(getVersionHistory("unknown"), []);
});
