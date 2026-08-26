import { describe, expect, it } from "vitest";
import { foldEvents } from "../src/fold.js";
import {
  selectArtifactsForStep,
  selectBlockedApprovals,
  selectBlockedContours,
  selectCompletedContours,
  selectLiveContours,
} from "../src/index.js";
import {
  allStepsOk,
  approvalRequired,
  contourFinished,
  contourStarted,
} from "./fixtures/builders.js";

describe("selectors", () => {
  it("selects live contours", () => {
    const rid = "rid_live";
    const events = [contourStarted("feature/x", undefined, { run_id: rid })];
    const model = foldEvents(events);
    const live = selectLiveContours(model);
    expect(live).toHaveLength(1);
    expect(live[0].status).toBe("running");
  });

  it("selects completed contours", () => {
    const rid = "rid_completed";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      ...allStepsOk("feature/x", rid),
      contourFinished("feature/x", "finished", undefined, { run_id: rid }),
    ];
    const model = foldEvents(events);
    const completed = selectCompletedContours(model);
    expect(completed).toHaveLength(1);
    expect(completed[0].status).toBe("finished");
  });

  it("selects blocked contours and approvals", () => {
    const rid = "rid_blocked";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      ...allStepsOk("feature/x", rid),
      approvalRequired("feature/x", "merge", undefined, { run_id: rid }),
    ];
    const model = foldEvents(events);
    expect(selectBlockedContours(model)).toHaveLength(1);
    const approvals = selectBlockedApprovals(model);
    expect(approvals).toHaveLength(1);
    expect(approvals[0].gate.action).toBe("merge");
  });

  it("selects artifacts for a step", () => {
    const rid = "rid_artifacts";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      ...allStepsOk("feature/x", rid),
    ];
    const model = foldEvents(events);
    const planArtifacts = selectArtifactsForStep(model, rid, "plan");
    expect(planArtifacts.some((a) => a.kind === "PLAN")).toBe(true);
  });
});
