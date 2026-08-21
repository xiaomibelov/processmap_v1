import { useMemo } from "react";
import { normalizeElementNotesMap } from "../../notes/elementNotes.js";
import {
  buildCoverageMatrix,
  normalizeAiQuestionsByElementMap,
} from "../../notes/knowledgeTools.js";
import {
  asArray,
  parseBpmnToSessionGraph,
  toNodeId,
} from "../lib/processStageDomain.js";
import {
  coverageMarkerClass,
  coverageReadinessPercent,
} from "../stage/utils/processStageHelpers.js";

export { deriveCoverageOutputs } from "./deriveCoverageOutputs.js";

/**
 * React hook — memoized coverage derivation.
 * Extracted from ProcessStage.jsx (lines 1738-1830).
 */
export default function useCoverageDerivation({
  draft,
  qualityHintsRaw,
  isCoverageMode,
}) {
  const notesByElementMap = useMemo(
    () => normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId),
    [draft?.notes_by_element, draft?.notesByElementId],
  );
  const aiQuestionsByElement = useMemo(
    () => normalizeAiQuestionsByElementMap(draft?.interview?.ai_questions_by_element || draft?.interview?.aiQuestionsByElementId),
    [draft?.interview?.ai_questions_by_element, draft?.interview?.aiQuestionsByElementId],
  );
  const coverageNodes = useMemo(() => {
    const direct = asArray(draft?.nodes);
    if (direct.length) return direct;
    const xml = String(draft?.bpmn_xml || "").trim();
    if (!xml) return [];
    const parsed = parseBpmnToSessionGraph(xml);
    return asArray(parsed?.nodes);
  }, [draft?.nodes, draft?.bpmn_xml]);
  const coverageMatrix = useMemo(
    () => buildCoverageMatrix({
      nodes: coverageNodes,
      notesByElement: notesByElementMap,
      aiQuestionsByElement,
    }),
    [coverageNodes, notesByElementMap, aiQuestionsByElement],
  );
  const coverageRowsAll = useMemo(
    () => asArray(coverageMatrix?.rows),
    [coverageMatrix],
  );
  const coverageRows = useMemo(
    () => coverageRowsAll.filter((row) => Number(row?.score || 0) > 0),
    [coverageRowsAll],
  );
  const coverageById = useMemo(() => {
    const map = {};
    coverageRowsAll.forEach((row) => {
      const id = toNodeId(row?.id);
      if (!id) return;
      map[id] = row;
    });
    return map;
  }, [coverageRowsAll]);
  const qualityIssueNodeIds = useMemo(() => {
    const set = new Set();
    asArray(qualityHintsRaw).forEach((issue) => {
      const id = toNodeId(issue?.nodeId);
      if (!id) return;
      set.add(id);
    });
    return set;
  }, [qualityHintsRaw]);
  const coverageMinimapRows = useMemo(
    () => coverageRowsAll
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
      }),
    [coverageRowsAll, qualityIssueNodeIds],
  );
  const coverageHints = useMemo(() => (
    isCoverageMode
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
      : []
  ), [isCoverageMode, coverageRowsAll]);

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
