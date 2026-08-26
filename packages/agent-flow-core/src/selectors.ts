import type { ApprovalGate, ArtifactChip, ContourModel } from "./types.js";

/**
 * Select contours that are currently running.
 */
export function selectLiveContours(model: ContourModel[]): ContourModel[] {
  return model.filter((c) => c.status === "running");
}

/**
 * Select contours that have finished successfully.
 */
export function selectCompletedContours(model: ContourModel[]): ContourModel[] {
  return model.filter((c) => c.status === "finished");
}

/**
 * Select contours that are blocked by an unresolved approval gate.
 */
export function selectBlockedContours(model: ContourModel[]): ContourModel[] {
  return model.filter(
    (c) => c.status === "blocked" || c.approvalGates.some((g) => !g.resolved)
  );
}

/**
 * Select all unresolved approval gates across contours.
 */
export function selectBlockedApprovals(
  model: ContourModel[]
): Array<{ contourId: string; runId: string; gate: ApprovalGate }> {
  const result: Array<{ contourId: string; runId: string; gate: ApprovalGate }> = [];
  for (const contour of model) {
    for (const gate of contour.approvalGates) {
      if (!gate.resolved) {
        result.push({
          contourId: contour.contourId,
          runId: contour.runId,
          gate,
        });
      }
    }
  }
  return result;
}

/**
 * Select artifacts for a specific regulation step.
 */
export function selectArtifactsForStep(
  model: ContourModel[],
  runId: string,
  stepName: string
): ArtifactChip[] {
  const contour = model.find((c) => c.runId === runId);
  if (!contour) return [];
  const step = contour.steps.find((s) => s.step === stepName);
  return step?.artifacts ?? [];
}
