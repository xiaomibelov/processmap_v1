import { describe, expect, it } from "vitest";
import { foldEvents, foldEventsTo } from "../src/fold.js";
import {
  allStepsOk,
  allStepsOkExceptPr,
  approvalRequired,
  artifactWritten,
  contourFinished,
  contourStarted,
  stepFinished,
  stepStarted,
} from "./fixtures/builders.js";

describe("foldEvents", () => {
  it("returns empty model for empty events", () => {
    expect(foldEvents([])).toEqual([]);
  });

  it("started contour has all steps pending", () => {
    const events = [contourStarted("feature/x")];
    const model = foldEvents(events);
    expect(model).toHaveLength(1);
    expect(model[0].status).toBe("running");
    expect(model[0].steps.every((s) => s.status === "pending")).toBe(true);
  });

  it("marks step as running then ok", () => {
    const rid = "rid_step_ok";
    const events = [
      contourStarted("feature/x", "2026-08-26T13:00:00.000Z", { run_id: rid }),
      stepStarted("feature/x", "plan", "2026-08-26T13:00:01.000Z", { run_id: rid }),
      stepFinished("feature/x", "plan", "ok", "2026-08-26T13:00:02.000Z", { run_id: rid }),
    ];
    const model = foldEvents(events);
    const planStep = model[0].steps.find((s) => s.step === "plan");
    expect(planStep?.status).toBe("ok");
    expect(planStep?.durationMs).toBe(1000);
  });

  it("attaches artifact chip to the correct step", () => {
    const rid = "rid_artifact";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      stepStarted("feature/x", "plan", undefined, { run_id: rid }),
      artifactWritten("feature/x", "PLAN", ".planning/contours/feature/x/PLAN.md", undefined, { run_id: rid }),
      stepFinished("feature/x", "plan", "ok", undefined, { run_id: rid }),
    ];
    const model = foldEvents(events);
    const planStep = model[0].steps.find((s) => s.step === "plan");
    expect(planStep?.artifacts).toHaveLength(1);
    expect(planStep?.artifacts[0].kind).toBe("PLAN");
  });

  it("blocks contour on approval.required", () => {
    const rid = "rid_blocked";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      ...allStepsOkExceptPr("feature/x", rid),
      approvalRequired("feature/x", "merge", undefined, { run_id: rid }),
    ];
    const model = foldEvents(events);
    expect(model[0].status).toBe("blocked");
    expect(model[0].approvalGates).toHaveLength(1);
    expect(model[0].approvalGates[0].action).toBe("merge");
  });

  it("seek back removes completed state", () => {
    const rid = "rid_seek";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      stepStarted("feature/x", "plan", undefined, { run_id: rid }),
      stepFinished("feature/x", "plan", "ok", undefined, { run_id: rid }),
      stepStarted("feature/x", "api", undefined, { run_id: rid }),
    ];
    const full = foldEvents(events);
    expect(full[0].steps.find((s) => s.step === "api")?.status).toBe("running");

    const rewind = foldEventsTo(events, 2);
    expect(rewind[0].steps.find((s) => s.step === "plan")?.status).toBe("ok");
    expect(rewind[0].steps.find((s) => s.step === "api")?.status).toBe("pending");
  });

  it("finished contour has correct status and duration", () => {
    const rid = "rid_finished";
    const events = [
      contourStarted("feature/x", "2026-08-26T13:00:00.000Z", { run_id: rid }),
      ...allStepsOk("feature/x", rid),
      contourFinished("feature/x", "finished", "2026-08-26T13:00:30.000Z", {
        run_id: rid,
      }),
    ];
    const model = foldEvents(events);
    expect(model[0].status).toBe("finished");
    expect(model[0].finishedAt).toBe("2026-08-26T13:00:30.000Z");
  });

  it("sorts multiple contours deterministically", () => {
    const events = [
      contourStarted("feature/a", "2026-08-26T10:00:00.000Z"),
      contourStarted("feature/b", "2026-08-26T09:00:00.000Z"),
    ];
    const model = foldEvents(events);
    expect(model.map((c) => c.contourId)).toEqual(["feature/b", "feature/a"]);
  });

  it("records step description from step.started", () => {
    const rid = "rid_desc";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      stepStarted("feature/x", "plan", undefined, {
        run_id: rid,
        description: "Draft plan",
      }),
    ];
    const model = foldEvents(events);
    const planStep = model[0].steps.find((s) => s.step === "plan");
    expect(planStep?.description).toBe("Draft plan");
  });

  it("tracks tool calls and token usage", () => {
    const rid = "rid_tools";
    const events = [
      contourStarted("feature/x", undefined, { run_id: rid }),
      stepStarted("feature/x", "api", undefined, { run_id: rid }),
      { ts: new Date().toISOString(), event: "tool.started", contour_id: "feature/x", run_id: rid, step: "api", tool: "Read" },
      { ts: new Date().toISOString(), event: "tool.finished", contour_id: "feature/x", run_id: rid, step: "api", tool: "Read", result: "ok" },
      { ts: new Date().toISOString(), event: "tokens.used", contour_id: "feature/x", run_id: rid, step: "api", tokens: 220 },
      stepFinished("feature/x", "api", "ok", undefined, { run_id: rid }),
    ];
    const model = foldEvents(events);
    const apiStep = model[0].steps.find((s) => s.step === "api");
    expect(apiStep?.toolCalls).toHaveLength(1);
    expect(apiStep?.toolCalls[0].name).toBe("Read");
    expect(apiStep?.toolCalls[0].status).toBe("ok");
    expect(apiStep?.outputTokens).toBe(220);
  });
});
