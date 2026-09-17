import type {
  ApprovalGate,
  ContourModel,
  RawEvent,
  RegulationStep,
} from "./types.js";

export const REGULATION_STEPS = [
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

const STEP_FOR_KIND: Record<string, string> = {
  RAG_PREFLIGHT: "rag_preflight",
  PLAN: "plan",
  API: "api",
  UI: "ui",
  TESTS: "tests",
  PR: "pr",
  EXEC_REPORT: "pr",
  REVIEW_REPORT: "pr",
  STATE: "plan",
  OTHER: "plan",
};

function makeSteps(): RegulationStep[] {
  return REGULATION_STEPS.map((step) => ({
    step,
    status: "pending" as const,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    description: null,
    toolCalls: [],
    outputTokens: 0,
    artifacts: [],
  }));
}

function parseTs(ts: string): number {
  return new Date(ts).getTime();
}

function resolveArtifactStep(
  steps: RegulationStep[],
  event: RawEvent
): RegulationStep | null {
  const explicitStep =
    typeof event.step === "string" ? event.step : undefined;
  if (explicitStep) {
    return steps.find((s) => s.step === explicitStep) ?? null;
  }

  const kind = typeof event.kind === "string" ? event.kind : "OTHER";
  const mapped = STEP_FOR_KIND[kind];
  if (mapped) {
    return steps.find((s) => s.step === mapped) ?? null;
  }

  // Fallback: last running step.
  const running = steps.filter((s) => s.status === "running");
  if (running.length > 0) {
    return running[running.length - 1];
  }

  return null;
}

function buildContour(runEvents: RawEvent[]): ContourModel {
  const startEvent = runEvents.find((e) => e.event === "contour.started");
  if (!startEvent) {
    throw new Error("Cannot build contour without contour.started event");
  }

  const startedAt = startEvent.ts as string;
  const contourId = startEvent.contour_id as string;
  const type = (startEvent.type as string) || "feature";
  const name = (startEvent.name as string) || contourId.split("/").pop() || contourId;
  const branch = (startEvent.branch as string) || contourId;
  const runId = startEvent.run_id as string;

  const steps = makeSteps();
  const approvalGates: ApprovalGate[] = [];
  let status: ContourModel["status"] = "running";
  let finishedAt: string | null = null;

  for (const event of runEvents) {
    const ts = event.ts as string;
    switch (event.event) {
      case "step.started": {
        const stepName = event.step as string;
        const step = steps.find((s) => s.step === stepName);
        if (step) {
          step.status = "running";
          step.startedAt = ts;
          if (typeof event.description === "string") {
            step.description = event.description;
          }
        }
        break;
      }
      case "step.finished": {
        const stepName = event.step as string;
        const result = event.result as string;
        const step = steps.find((s) => s.step === stepName);
        if (step && step.startedAt) {
          step.status = ["ok", "fail", "skipped"].includes(result)
            ? (result as RegulationStep["status"])
            : "ok";
          step.finishedAt = ts;
          step.durationMs = parseTs(ts) - parseTs(step.startedAt);
        }
        break;
      }
      case "tool.started": {
        const stepName = event.step as string;
        const step = steps.find((s) => s.step === stepName);
        if (step) {
          step.toolCalls.push({
            name: (event.tool as string) || "tool",
            status: "pending",
            startedAt: ts,
            finishedAt: null,
          });
        }
        break;
      }
      case "tool.finished": {
        const stepName = event.step as string;
        const step = steps.find((s) => s.step === stepName);
        if (step) {
          const last = step.toolCalls.find((t) => t.status === "pending");
          if (last) {
            last.status = ["ok", "fail"].includes(event.result as string)
              ? (event.result as "ok" | "fail")
              : "ok";
            last.finishedAt = ts;
          }
        }
        break;
      }
      case "tokens.used": {
        const stepName = event.step as string;
        const step = steps.find((s) => s.step === stepName);
        if (step && typeof event.tokens === "number") {
          step.outputTokens += event.tokens;
        }
        break;
      }
      case "artifact.written": {
        const step = resolveArtifactStep(steps, event);
        if (step) {
          step.artifacts.push({
            kind: (event.kind as string) || "OTHER",
            path: (event.path as string) || "",
            writtenAt: ts,
          });
        }
        break;
      }
      case "approval.required": {
        approvalGates.push({
          action: (event.action as string) || "unknown",
          reason: (event.reason as string) || null,
          requiredAt: ts,
          resolved: false,
          resolvedAt: null,
        });
        status = "blocked";
        break;
      }
      case "approval.granted": {
        const action = event.action as string;
        const gate = approvalGates.find(
          (g) => g.action === action && !g.resolved
        );
        if (gate) {
          gate.resolved = true;
          gate.resolvedAt = ts;
        }
        if (approvalGates.every((g) => g.resolved) && status === "blocked") {
          status = "running";
        }
        break;
      }
      case "contour.finished": {
        const finalStatus = event.status as string;
        status = ["finished", "blocked", "cancelled"].includes(finalStatus)
          ? (finalStatus as ContourModel["status"])
          : "finished";
        finishedAt = ts;
        break;
      }
    }
  }

  return {
    contourId,
    type,
    name,
    branch,
    runId,
    status,
    startedAt,
    finishedAt,
    steps,
    approvalGates,
  };
}

/**
 * Fold all events into the latest contour model state.
 */
export function foldEvents(events: RawEvent[]): ContourModel[] {
  return foldEventsTo(events, events.length - 1);
}

/**
 * Fold events up to and including the given index.
 * Returns an empty model for negative indices.
 */
export function foldEventsTo(
  events: RawEvent[],
  index: number
): ContourModel[] {
  const effectiveIndex = Math.min(index, events.length - 1);
  if (effectiveIndex < 0) return [];

  const byRun = new Map<string, RawEvent[]>();
  const orderedRuns: string[] = [];

  for (let i = 0; i <= effectiveIndex; i++) {
    const event = events[i];
    if (!byRun.has(event.run_id)) {
      byRun.set(event.run_id, []);
      orderedRuns.push(event.run_id);
    }
    byRun.get(event.run_id)!.push(event);
  }

  const models: ContourModel[] = [];
  for (const runId of orderedRuns) {
    const runEvents = byRun.get(runId)!;
    if (runEvents.some((e) => e.event === "contour.started")) {
      models.push(buildContour(runEvents));
    }
  }

  // Deterministic order: by start time, then contour id, then run id.
  models.sort((a, b) => {
    const ta = new Date(a.startedAt).getTime();
    const tb = new Date(b.startedAt).getTime();
    if (ta !== tb) return ta - tb;
    if (a.contourId !== b.contourId) return a.contourId.localeCompare(b.contourId);
    return a.runId.localeCompare(b.runId);
  });

  return models;
}

/**
 * Empty model representation.
 */
export function emptyModel(): ContourModel[] {
  return [];
}
