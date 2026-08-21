import assert from "node:assert/strict";
import test from "node:test";
import { computeQualityDerivation } from "./useQualityDerivation.js";

const emptyDraft = { nodes: [], edges: [], questions: [], bpmn_xml: "", interview: {} };

test("computeQualityDerivation returns all 8 fields", () => {
  const result = computeQualityDerivation({
    draft: null,
    qualityProfileId: "mvp",
    apiClarifyHints: [],
    isQualityMode: false,
  });

  const keys = Object.keys(result).sort();
  assert.deepEqual(keys, [
    "activeHints",
    "bottlenecks",
    "lintResult",
    "qualityAutoFixPreview",
    "qualityHints",
    "qualityHintsRaw",
    "qualityProfile",
    "qualitySummary",
  ]);
});

test("qualityHints is empty when isQualityMode=false", () => {
  const result = computeQualityDerivation({
    draft: emptyDraft,
    qualityProfileId: "mvp",
    apiClarifyHints: [],
    isQualityMode: false,
  });

  assert.deepEqual(result.qualityHints, []);
});

test("qualityHints decorates issues when isQualityMode=true", () => {
  const result = computeQualityDerivation({
    draft: emptyDraft,
    qualityProfileId: "mvp",
    apiClarifyHints: [],
    isQualityMode: true,
  });

  assert.ok(Array.isArray(result.qualityHints));
  for (const item of result.qualityHints) {
    assert.equal(item.markerClass, "fpcQualityProblem");
    assert.equal(item.hideTag, true);
  }
});

test("activeHints returns apiClarifyHints when non-empty", () => {
  const hints = [{ id: "h1", text: "test" }];
  const result = computeQualityDerivation({
    draft: emptyDraft,
    qualityProfileId: "mvp",
    apiClarifyHints: hints,
    isQualityMode: false,
  });

  assert.equal(result.activeHints, hints);
});

test("activeHints falls back to bottlenecks when apiClarifyHints is empty", () => {
  const result = computeQualityDerivation({
    draft: emptyDraft,
    qualityProfileId: "mvp",
    apiClarifyHints: [],
    isQualityMode: false,
  });

  assert.equal(result.activeHints, result.bottlenecks);
});

test("qualitySummary has default shape when draft is null", () => {
  const result = computeQualityDerivation({
    draft: null,
    qualityProfileId: "mvp",
    apiClarifyHints: [],
    isQualityMode: false,
  });

  assert.equal(result.qualitySummary.total, 0);
  assert.equal(result.qualitySummary.errors, 0);
  assert.equal(result.qualitySummary.warns, 0);
});

test("qualityProfile falls back to mvp profile when no lint profile", () => {
  const result = computeQualityDerivation({
    draft: null,
    qualityProfileId: "mvp",
    apiClarifyHints: [],
    isQualityMode: false,
  });

  assert.ok(result.qualityProfile);
  assert.equal(typeof result.qualityProfile, "object");
});

test("qualityHintsRaw is always an array", () => {
  const result = computeQualityDerivation({
    draft: null,
    qualityProfileId: "mvp",
    apiClarifyHints: [],
    isQualityMode: false,
  });

  assert.ok(Array.isArray(result.qualityHintsRaw));
});

test("bottlenecks is always an array", () => {
  const result = computeQualityDerivation({
    draft: emptyDraft,
    qualityProfileId: "mvp",
    apiClarifyHints: [],
    isQualityMode: false,
  });

  assert.ok(Array.isArray(result.bottlenecks));
});
