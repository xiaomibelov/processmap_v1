import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { DOD_EXPLAINABILITY, listDodExplainabilityEntries } from "./dod/dodExplainability.js";

const stageSource = fs.readFileSync(new URL("./DodStage.jsx", import.meta.url), "utf8");
const tooltipSource = fs.readFileSync(new URL("./dod/DodExplainTooltip.jsx", import.meta.url), "utf8");

test("DoD stage keeps explainability hints for summary and tables", () => {
  assert.match(stageSource, /HintLabel text="Общая готовность"/);
  assert.match(stageSource, /HintLabel text="Документ"/);
  assert.match(stageSource, /HintLabel text="Автоматизация"/);
  assert.match(stageSource, /HintLabel text="Аудит"/);
  assert.match(stageSource, /HintLabel text="Вес"/);
  assert.match(stageSource, /HintLabel text="%"/);
  assert.match(stageSource, /HintLabel text="Вклад"/);
  assert.match(stageSource, /HintLabel text="Тип"/);
  assert.match(stageSource, /HintLabel text="Статус"/);
});

test("DoD tooltip uses portal and four-line explanatory format", () => {
  assert.match(tooltipSource, /createPortal/);
  assert.match(tooltipSource, /document\.body/);
  assert.match(tooltipSource, /role="tooltip"/);
  assert.match(tooltipSource, /Что проверяется:/);
  assert.match(tooltipSource, /Как считается:/);
  assert.match(tooltipSource, /Источник:/);
  assert.match(tooltipSource, /Влияние:/);
});

test("DoD explainability config keeps required fields for each entry", () => {
  const entries = listDodExplainabilityEntries();
  assert.ok(entries.length >= 20);
  for (const entry of entries) {
    const value = entry.value || {};
    assert.ok(typeof value.code === "string" && value.code.trim().length > 0, `${entry.path}: code is required`);
    assert.ok(typeof value.label === "string" && value.label.trim().length > 0, `${entry.path}: label is required`);
    assert.ok(typeof value.whatChecked === "string" && value.whatChecked.trim().length > 0, `${entry.path}: whatChecked is required`);
    assert.ok(typeof value.howCalculated === "string" && value.howCalculated.trim().length > 0, `${entry.path}: howCalculated is required`);
    assert.ok(typeof value.source === "string" && value.source.trim().length > 0, `${entry.path}: source is required`);
    assert.ok(typeof value.impact === "string" && value.impact.trim().length > 0, `${entry.path}: impact is required`);
  }
});

test("DoD stage renders signal expansion with kind badges", () => {
  assert.match(stageSource, /SectionSignalsPanel/);
  assert.match(stageSource, /SectionRow/);
  assert.match(stageSource, /toKindLabel/);
  assert.match(stageSource, /toKindTone/);
  assert.match(stageSource, /"canonical"/);
  assert.match(stageSource, /"secondary"/);
  assert.match(stageSource, /"info"/);
});

test("DoD tooltip renders classification line for kind/isCanonical", () => {
  assert.match(tooltipSource, /Классификация:/);
  assert.match(tooltipSource, /Canonical supporting artifact/);
  assert.match(tooltipSource, /Secondary artifact/);
  assert.match(tooltipSource, /Non-canonical \(informational\)/);
  assert.match(tooltipSource, /Blocking/);
});

test("DoD explainability config covers mandatory entities", () => {
  assert.ok(DOD_EXPLAINABILITY.summary.readiness);
  assert.ok(DOD_EXPLAINABILITY.summary.document);
  assert.ok(DOD_EXPLAINABILITY.summary.automation);
  assert.ok(DOD_EXPLAINABILITY.summary.audit);
  assert.ok(DOD_EXPLAINABILITY.summary.blockers);
  assert.ok(DOD_EXPLAINABILITY.summary.gaps);

  assert.ok(DOD_EXPLAINABILITY.sections.structure_graph);
  assert.ok(DOD_EXPLAINABILITY.sections.paths_sequence);
  assert.ok(DOD_EXPLAINABILITY.sections.autopass_execution);
  assert.ok(DOD_EXPLAINABILITY.sections.steps_completeness);
  assert.ok(DOD_EXPLAINABILITY.sections.traceability_audit);
  assert.ok(DOD_EXPLAINABILITY.sections.readiness_artifacts);

  assert.ok(DOD_EXPLAINABILITY.issues.STR_003);
  assert.ok(DOD_EXPLAINABILITY.issues.PATH_002);
  assert.ok(DOD_EXPLAINABILITY.issues.EXEC_001);
  assert.ok(DOD_EXPLAINABILITY.issues.STEP_001);
  assert.ok(DOD_EXPLAINABILITY.issues.STEP_002);
  assert.ok(DOD_EXPLAINABILITY.issues.READY_001);
});
