import { useMemo } from "react";
import {
  asArray,
  buildBottleneckHints,
} from "../lib/processStageDomain.js";
import {
  buildLintAutoFixPreview,
  LINT_PROFILES,
  runBpmnLint,
} from "../bpmn/lint/bpmnLint.js";

/**
 * Pure computation — derives all quality/lint signals from inputs.
 * Exported separately for unit testing without React runtime.
 */
export function computeQualityDerivation({
  draft,
  qualityProfileId,
  apiClarifyHints,
  isQualityMode,
}) {
  const bottlenecks = buildBottleneckHints(draft?.nodes, draft?.edges, draft?.questions);

  const lintResult = runBpmnLint({
    xmlText: draft?.bpmn_xml,
    interview: draft?.interview,
    nodes: draft?.nodes,
    profileId: qualityProfileId,
  });

  const qualityHintsRaw = asArray(lintResult?.issues);
  const qualitySummary = lintResult?.summary || { total: 0, errors: 0, warns: 0 };
  const qualityProfile = lintResult?.profile || LINT_PROFILES.mvp;

  const qualityAutoFixPreview = buildLintAutoFixPreview({
    xmlText: draft?.bpmn_xml,
    issues: qualityHintsRaw,
  });

  const activeHints = apiClarifyHints.length ? apiClarifyHints : bottlenecks;

  const qualityHints = isQualityMode
    ? qualityHintsRaw.map((issue) => ({
      ...issue,
      markerClass: "fpcQualityProblem",
      hideTag: true,
    }))
    : [];

  return {
    bottlenecks,
    lintResult,
    qualityHintsRaw,
    qualitySummary,
    qualityProfile,
    qualityAutoFixPreview,
    activeHints,
    qualityHints,
  };
}

/**
 * React hook wrapper — memoized version of computeQualityDerivation.
 * Extracted from ProcessStage.jsx (lines 564-611).
 */
export default function useQualityDerivation({
  draft,
  qualityProfileId,
  apiClarifyHints,
  isQualityMode,
}) {
  const bottlenecks = useMemo(
    () => buildBottleneckHints(draft?.nodes, draft?.edges, draft?.questions),
    [draft?.nodes, draft?.edges, draft?.questions],
  );

  const lintResult = useMemo(
    () => runBpmnLint({
      xmlText: draft?.bpmn_xml,
      interview: draft?.interview,
      nodes: draft?.nodes,
      profileId: qualityProfileId,
    }),
    [draft?.bpmn_xml, draft?.interview, draft?.nodes, qualityProfileId],
  );

  const qualityHintsRaw = useMemo(
    () => asArray(lintResult?.issues),
    [lintResult],
  );

  const qualitySummary = useMemo(
    () => lintResult?.summary || { total: 0, errors: 0, warns: 0 },
    [lintResult],
  );

  const qualityProfile = useMemo(
    () => lintResult?.profile || LINT_PROFILES.mvp,
    [lintResult],
  );

  const qualityAutoFixPreview = useMemo(
    () => buildLintAutoFixPreview({
      xmlText: draft?.bpmn_xml,
      issues: qualityHintsRaw,
    }),
    [draft?.bpmn_xml, qualityHintsRaw],
  );

  const activeHints = useMemo(
    () => (apiClarifyHints.length ? apiClarifyHints : bottlenecks),
    [apiClarifyHints, bottlenecks],
  );

  const qualityHints = useMemo(
    () => (
      isQualityMode
        ? qualityHintsRaw.map((issue) => ({
          ...issue,
          markerClass: "fpcQualityProblem",
          hideTag: true,
        }))
        : []
    ),
    [isQualityMode, qualityHintsRaw],
  );

  return {
    bottlenecks,
    lintResult,
    qualityHintsRaw,
    qualitySummary,
    qualityProfile,
    qualityAutoFixPreview,
    activeHints,
    qualityHints,
  };
}
