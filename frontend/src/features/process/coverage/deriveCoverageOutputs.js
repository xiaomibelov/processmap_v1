import {
  asArray,
  toNodeId,
} from "../lib/processStageDomain.js";

function coverageReadinessPercent(row) {
  const score = Number(row?.score || 0);
  const clamped = Number.isFinite(score) ? Math.max(0, Math.min(3, score)) : 0;
  return Math.round(((3 - clamped) / 3) * 100);
}

function coverageMarkerClass(row) {
  const score = Number(row?.score || 0);
  if (!Number.isFinite(score) || score <= 0) return "fpcCoverageReady";
  if (score <= 1) return "fpcCoverageWarn";
  return "fpcCoverageRisk";
}

/**
 * Pure post-matrix derivation — takes coverageNodes, coverageMatrix,
 * qualityHintsRaw, and isCoverageMode and produces all downstream
 * coverage signals. Separated from the hook for direct unit testing
 * without the notes/helpers module chain.
 *
 * Note: coverageReadinessPercent / coverageMarkerClass are inlined here
 * (mirrored from processStageHelpers) to avoid pulling in the full
 * helpers module which has Vite-only imports incompatible with node --test.
 */
export function deriveCoverageOutputs({
  coverageNodes,
  coverageMatrix,
  qualityHintsRaw,
  isCoverageMode,
}) {
  const coverageRowsAll = asArray(coverageMatrix?.rows);

  const coverageRows = coverageRowsAll.filter((row) => Number(row?.score || 0) > 0);

  const coverageById = {};
  coverageRowsAll.forEach((row) => {
    const id = toNodeId(row?.id);
    if (!id) return;
    coverageById[id] = row;
  });

  const qualityIssueNodeIds = new Set();
  asArray(qualityHintsRaw).forEach((issue) => {
    const id = toNodeId(issue?.nodeId);
    if (!id) return;
    qualityIssueNodeIds.add(id);
  });

  const coverageMinimapRows = coverageRowsAll
    .filter((row) => {
      const id = toNodeId(row?.id);
      if (!id) return false;
      if (Number(row?.score || 0) > 0) return true;
      return qualityIssueNodeIds.has(id);
    })
    .map((row) => {
      const id = toNodeId(row?.id);
      return {
        ...row,
        id,
        readiness: coverageReadinessPercent(row),
        hasQualityIssue: !!(id && qualityIssueNodeIds.has(id)),
      };
    });

  const coverageHints = isCoverageMode
    ? coverageRowsAll.map((row) => {
      const readiness = coverageReadinessPercent(row);
      const score = Number(row?.score || 0);
      const severity = score >= 2 ? "high" : (score >= 1 ? "medium" : "low");
      const reasons = [];
      if (row?.missingNotes) reasons.push("нет заметок");
      if (row?.missingAiQuestions) reasons.push("нет AI-вопросов");
      if (row?.missingDurationQuality) reasons.push("нет duration/quality");
      return {
        nodeId: toNodeId(row?.id),
        title: String(row?.title || row?.id || "").trim(),
        severity,
        reasons,
        markerClass: coverageMarkerClass(row),
        hideTag: true,
        aiHint: `READY ${readiness}%`,
        coverageScore: score,
        coverageReadiness: readiness,
      };
    }).filter((item) => item.nodeId)
    : [];

  return {
    coverageNodes,
    coverageMatrix,
    coverageRowsAll,
    coverageRows,
    coverageById,
    coverageMinimapRows,
    coverageHints,
  };
}
