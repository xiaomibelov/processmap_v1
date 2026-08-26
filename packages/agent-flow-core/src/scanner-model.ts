import {
  type ApprovalGate,
  type ArtifactChip,
  type ContourModel,
  type RegulationStep,
  type ScannedFile,
} from "./types.js";
import { REGULATION_STEPS } from "./fold.js";

export type { ScannedFile };

const PHASE_GATE_FILES = new Set([
  "READY_FOR_EXECUTION",
  "READY_FOR_REVIEW",
  "WORKER_DONE",
  "WORKER_STARTED",
  "REVIEW_PASS",
  "REVIEW_STARTED",
  "CHANGES_REQUESTED",
  "EXEC_BLOCKED",
  "REVIEW_BLOCKED",
  "MERGED",
  "EXECUTION_STARTED",
]);

const STATE_STATUS_MAP: Record<string, ContourModel["status"] | undefined> = {
  in_progress: "running",
  running: "running",
  ready_for_execution: "blocked",
  ready_for_review: "blocked",
  blocked: "blocked",
  finished: "finished",
  closed: "finished",
  cancelled: "cancelled",
  unknown: "unknown",
};

const GATE_STATUS_MAP: Record<string, ContourModel["status"] | undefined> = {
  READY_FOR_EXECUTION: "blocked",
  READY_FOR_REVIEW: "blocked",
  EXEC_BLOCKED: "blocked",
  REVIEW_BLOCKED: "blocked",
  CHANGES_REQUESTED: "blocked",
  WORKER_DONE: "finished",
  REVIEW_PASS: "finished",
  MERGED: "finished",
  WORKER_STARTED: "running",
  REVIEW_STARTED: "running",
  EXECUTION_STARTED: "running",
};

function isPhaseGate(name: string): boolean {
  return PHASE_GATE_FILES.has(name) || name.endsWith(".ready");
}

function toIsoString(mtime: Date | number | string | unknown): string {
  if (mtime instanceof Date) return mtime.toISOString();
  if (typeof mtime === "number") return new Date(mtime).toISOString();
  if (typeof mtime === "string") return new Date(mtime).toISOString();
  return new Date().toISOString();
}

export function mapArtifactKind(fileName: string): string {
  const upper = fileName.toUpperCase();
  if (upper.startsWith("RAG_PREFLIGHT")) return "RAG_PREFLIGHT";
  if (upper === "PLAN.MD") return "PLAN";
  if (upper === "API.MD") return "API";
  if (upper === "UI.MD") return "UI";
  if (upper === "TESTS.MD") return "TESTS";
  if (upper === "PR.MD") return "PR";
  if (upper === "EXEC_REPORT.MD") return "EXEC_REPORT";
  if (upper === "REVIEW_REPORT.MD") return "REVIEW_REPORT";
  if (upper === "STATE.JSON") return "STATE";
  if (upper === "USER_PROMPT.MD") return "PLAN";
  if (upper === "WORKER_PROMPT.MD") return "PLAN";
  if (upper === "REVIEWER_PROMPT.MD") return "PR";
  if (upper === "OBSIDIAN_CONTEXT_USED.MD") return "read_obsidian";
  if (upper === "RUNTIME_NAVIGATION.MD") return "read_agents_md";
  if (upper === "RUNTIME_PROOF_CHECKLIST.MD") return "tests";
  return "OTHER";
}

export function artifactStepKind(kind: string): string | undefined {
  const map: Record<string, string> = {
    RAG_PREFLIGHT: "rag_preflight",
    PLAN: "plan",
    API: "api",
    UI: "ui",
    TESTS: "tests",
    PR: "pr",
    EXEC_REPORT: "pr",
    REVIEW_REPORT: "pr",
    STATE: "plan",
    read_obsidian: "read_obsidian",
    read_agents_md: "read_agents_md",
  };
  return map[kind];
}

export interface ScannedFileInfo {
  name: string;
  path: string;
  size: number;
  mtime: Date | number | string;
}


export interface ScannedContourInput {
  type: string;
  name: string;
  contourId: string;
  state: unknown;
  gates: string[];
  files: ScannedFileInfo[];
}

export function determineStatus(
  state: unknown,
  gates: string[]
): ContourModel["status"] {
  const stateStatus =
    state && typeof state === "object" && typeof (state as Record<string, unknown>).status === "string"
      ? ((state as Record<string, unknown>).status as string)
      : undefined;

  if (stateStatus) {
    const mapped = STATE_STATUS_MAP[stateStatus.toLowerCase()];
    if (mapped) return mapped;
  }

  for (const gate of gates) {
    const mapped = GATE_STATUS_MAP[gate];
    if (mapped) return mapped;
  }

  return "unknown";
}

function buildApprovalGate(gate: string, requiredAt: string): ApprovalGate | null {
  if (gate === "READY_FOR_EXECUTION") {
    return {
      action: "execute",
      reason: "Waiting for execution approval",
      requiredAt,
      resolved: false,
      resolvedAt: null,
    };
  }
  if (gate === "READY_FOR_REVIEW") {
    return {
      action: "review",
      reason: "Waiting for review",
      requiredAt,
      resolved: false,
      resolvedAt: null,
    };
  }
  return null;
}

function makeEmptySteps(): RegulationStep[] {
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

export function buildContourFromScan(input: ScannedContourInput): ContourModel {
  const { type, name, contourId, state, gates, files } = input;

  const branch =
    state && typeof state === "object" && typeof (state as Record<string, unknown>).branch === "string"
      ? ((state as Record<string, unknown>).branch as string)
      : contourId;

  const status = determineStatus(state, gates);

  const mtimes = files.map((f) => {
    const d = f.mtime instanceof Date ? f.mtime : new Date(f.mtime);
    return Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
  });

  const startedAtMs = mtimes.length > 0 ? Math.min(...mtimes) : Date.now();
  const finishedAtMs = mtimes.length > 0 ? Math.max(...mtimes) : Date.now();

  const steps = makeEmptySteps();
  const scannedFiles: ScannedFile[] = [];
  const approvalGates: ApprovalGate[] = [];

  // Approval gates from explicit gate files listed separately (no mtime available).
  for (const gate of gates) {
    const g = buildApprovalGate(gate, new Date().toISOString());
    if (g) approvalGates.push(g);
  }

  for (const file of files) {
    if (isPhaseGate(file.name)) {
      const gate = buildApprovalGate(file.name, toIsoString(file.mtime));
      if (gate) approvalGates.push(gate);
      continue;
    }

    const kind = mapArtifactKind(file.name);
    const stepName = artifactStepKind(kind);
    const chip: ArtifactChip = {
      kind,
      path: file.path,
      writtenAt: toIsoString(file.mtime),
    };

    if (stepName) {
      const step = steps.find((s) => s.step === stepName);
      if (step) {
        step.status = "ok";
        step.finishedAt = toIsoString(file.mtime);
        step.artifacts.push(chip);
      }
    }

    scannedFiles.push({
      name: file.name,
      path: file.path,
      size: file.size,
      mtime: toIsoString(file.mtime),
    });
  }

  // Regulation chain is sequential: any completed step implies all previous
  // steps are also completed for snapshot purposes.
  const lastOkIndex = steps.reduce((acc, s, i) => (s.status === "ok" ? i : acc), -1);
  for (let i = 0; i < lastOkIndex; i++) {
    if (steps[i].status === "pending") {
      steps[i].status = "ok";
      steps[i].finishedAt = steps[lastOkIndex].finishedAt;
    }
  }

  if (status === "running") {
    const firstPending = steps.find((s) => s.status === "pending");
    if (firstPending) {
      firstPending.status = "running";
      firstPending.startedAt = toIsoString(finishedAtMs);
    }
  }

  return {
    contourId,
    type,
    name,
    branch,
    runId: `scan-${type}-${name}`,
    status,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: status === "finished" ? new Date(finishedAtMs).toISOString() : null,
    steps,
    approvalGates,
    files: scannedFiles,
  };
}

export function buildContoursFromScan(inputs: ScannedContourInput[]): ContourModel[] {
  const models = inputs.map(buildContourFromScan);
  models.sort((a, b) => {
    const ta = new Date(a.startedAt).getTime();
    const tb = new Date(b.startedAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.contourId.localeCompare(b.contourId);
  });
  return models;
}
