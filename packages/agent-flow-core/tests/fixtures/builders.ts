import type { RawEvent } from "../../src/types.js";

let runIdCounter = 0;

export function runId(): string {
  runIdCounter += 1;
  return `${runIdCounter.toString(16).padStart(32, "0")}`;
}

export function resetRunIdCounter(): void {
  runIdCounter = 0;
}

export function contourStarted(
  contourId: string,
  ts?: string,
  overrides: Partial<RawEvent> = {}
): RawEvent {
  const now = ts ?? new Date().toISOString();
  return {
    ts: now,
    event: "contour.started",
    contour_id: contourId,
    run_id: overrides.run_id ?? runId(),
    type: "feature",
    name: contourId.split("/").pop() ?? contourId,
    branch: contourId,
    ...overrides,
  };
}

export function stepStarted(
  contourId: string,
  step: string,
  ts?: string,
  overrides: Partial<RawEvent> = {}
): RawEvent {
  return {
    ts: ts ?? new Date().toISOString(),
    event: "step.started",
    contour_id: contourId,
    run_id: overrides.run_id ?? runId(),
    step,
    ...overrides,
  };
}

export function stepFinished(
  contourId: string,
  step: string,
  result: "ok" | "fail" | "skipped" = "ok",
  ts?: string,
  overrides: Partial<RawEvent> = {}
): RawEvent {
  return {
    ts: ts ?? new Date().toISOString(),
    event: "step.finished",
    contour_id: contourId,
    run_id: overrides.run_id ?? runId(),
    step,
    result,
    ...overrides,
  };
}

export function artifactWritten(
  contourId: string,
  kind: string,
  path: string,
  ts?: string,
  overrides: Partial<RawEvent> = {}
): RawEvent {
  return {
    ts: ts ?? new Date().toISOString(),
    event: "artifact.written",
    contour_id: contourId,
    run_id: overrides.run_id ?? runId(),
    kind,
    path,
    ...overrides,
  };
}

export function approvalRequired(
  contourId: string,
  action: string,
  ts?: string,
  overrides: Partial<RawEvent> = {}
): RawEvent {
  return {
    ts: ts ?? new Date().toISOString(),
    event: "approval.required",
    contour_id: contourId,
    run_id: overrides.run_id ?? runId(),
    action,
    ...overrides,
  };
}

export function approvalGranted(
  contourId: string,
  action: string,
  ts?: string,
  overrides: Partial<RawEvent> = {}
): RawEvent {
  return {
    ts: ts ?? new Date().toISOString(),
    event: "approval.granted",
    contour_id: contourId,
    run_id: overrides.run_id ?? runId(),
    action,
    ...overrides,
  };
}

export function contourFinished(
  contourId: string,
  status: "finished" | "blocked" | "cancelled" = "finished",
  ts?: string,
  overrides: Partial<RawEvent> = {}
): RawEvent {
  return {
    ts: ts ?? new Date().toISOString(),
    event: "contour.finished",
    contour_id: contourId,
    run_id: overrides.run_id ?? runId(),
    status,
    ...overrides,
  };
}

const KIND_FOR_STEP: Record<string, string> = {
  rag_preflight: "RAG_PREFLIGHT",
  read_agents_md: "OTHER",
  read_obsidian: "OTHER",
  plan: "PLAN",
  api: "API",
  ui: "UI",
  tests: "TESTS",
  pr: "PR",
  mirror: "RAG_PREFLIGHT",
};

export function allStepsOk(
  contourId: string,
  runIdValue: string,
  startTime = new Date().toISOString()
): RawEvent[] {
  const steps = [
    "rag_preflight",
    "read_agents_md",
    "read_obsidian",
    "plan",
    "api",
    "ui",
    "tests",
    "pr",
    "mirror",
  ];
  const events: RawEvent[] = [];
  let t = new Date(startTime).getTime();
  for (const step of steps) {
    events.push(
      stepStarted(contourId, step, new Date(t).toISOString(), { run_id: runIdValue })
    );
    t += 1000;
    const kind = KIND_FOR_STEP[step] ?? "OTHER";
    const path = `.planning/contours/${contourId}/${kind === "RAG_PREFLIGHT" && step === "rag_preflight" ? "RAG_PREFLIGHT_PLANNER.md" : kind + ".md"}`;
    events.push(
      artifactWritten(contourId, kind, path, new Date(t).toISOString(), {
        run_id: runIdValue,
        step,
      })
    );
    t += 1000;
    events.push(
      stepFinished(contourId, step, "ok", new Date(t).toISOString(), {
        run_id: runIdValue,
      })
    );
    t += 1000;
  }
  return events;
}

export function allStepsOkExceptPr(
  contourId: string,
  runIdValue: string,
  startTime = new Date().toISOString()
): RawEvent[] {
  const steps = [
    "rag_preflight",
    "read_agents_md",
    "read_obsidian",
    "plan",
    "api",
    "ui",
    "tests",
  ];
  const events: RawEvent[] = [];
  let t = new Date(startTime).getTime();
  for (const step of steps) {
    events.push(
      stepStarted(contourId, step, new Date(t).toISOString(), { run_id: runIdValue })
    );
    t += 1000;
    events.push(
      stepFinished(contourId, step, "ok", new Date(t).toISOString(), {
        run_id: runIdValue,
      })
    );
    t += 1000;
  }
  return events;
}
