import { asArray, asObject } from "../../../lib/processStageDomain";
import { toText } from "../../../stage/utils/processStageHelpers";
import { normalizeElementNotesMap } from "../../../../notes/elementNotes";
import { fnv1aHex } from "../../../../../lib/apiCore.js";

function readStepTimeSeconds(nodeRaw) {
  const node = asObject(nodeRaw);
  const sec = Number(node?.step_time_sec ?? node?.duration_sec ?? node?.step_time_min ?? node?.duration_min ?? NaN);
  if (Number.isFinite(sec)) return sec;
  const min = Number(node?.step_time_min ?? node?.duration_min ?? NaN);
  if (Number.isFinite(min)) return min * 60;
  return NaN;
}

export default function buildInterviewDecorSignature(draftRaw, aiModeEnabled, displayModeRaw) {
  const draft = asObject(draftRaw);
  const interview = asObject(draft?.interview);
  const steps = asArray(interview?.steps);
  const stepSig = steps
    .map((step, idx) => {
      const stepObj = asObject(step);
      const stepId = toText(stepObj?.id) || `#${idx}`;
      const nodeId = toText(stepObj?.node_bind_id || stepObj?.node_id || stepObj?.nodeId);
      const duration = toText(stepObj?.step_time_sec || stepObj?.duration_sec || stepObj?.step_time_min || stepObj?.duration_min);
      return `${stepId}:${nodeId}:${duration}`;
    })
    .join("|");

  const aiMap = asObject(interview?.ai_questions_by_element || interview?.aiQuestionsByElementId);
  const aiSig = Object.keys(aiMap)
    .map((nodeId) => toText(nodeId))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((nodeId) => {
      const list = asArray(aiMap[nodeId]);
      const done = list.reduce((acc, item) => acc + Number(asObject(item)?.status === "done"), 0);
      return `${nodeId}:${list.length}:${done}`;
    })
    .join("|");

  const notesMap = normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId);
  const notesSig = Object.keys(notesMap)
    .map((nodeId) => toText(nodeId))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((nodeId) => `${nodeId}:${asArray(asObject(notesMap[nodeId])?.items).length}`)
    .join("|");

  const nodes = asArray(draft?.nodes);
  const nodeSig = nodes
    .map((rawNode, idx) => {
      const node = asObject(rawNode);
      const nodeId = toText(node?.id) || `node_${idx + 1}`;
      const stepSeconds = readStepTimeSeconds(node);
      return `${nodeId}:${Number.isFinite(stepSeconds) ? stepSeconds : ""}`;
    })
    .join("|");

  return fnv1aHex(
    `${toText(displayModeRaw)}|${aiModeEnabled ? 1 : 0}|s:${steps.length}:${fnv1aHex(stepSig)}|`
    + `a:${fnv1aHex(aiSig)}|n:${fnv1aHex(notesSig)}|d:${nodes.length}:${fnv1aHex(nodeSig)}`,
  );
}
