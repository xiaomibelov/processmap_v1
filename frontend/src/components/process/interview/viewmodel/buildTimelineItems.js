import { toArray, toText } from "../utils.js";

export function buildInterviewTimelineItems(timelineView) {
  const out = [];
  toArray(timelineView).forEach((step, idx) => {
    const stepId = toText(step?.id) || `step_${idx + 1}`;
    out.push({
      kind: "step",
      id: stepId,
      step,
    });
    const between = step?.between_branches_item;
    if (!between || toText(between?.kind).toLowerCase() !== "between_branches") return;
    out.push({
      kind: "between_branches",
      id: `between_${stepId}`,
      anchorStepId: stepId,
      between,
    });
  });
  return out;
}
