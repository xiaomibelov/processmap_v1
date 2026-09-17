/**
 * Raw event as stored in the agent event log (NDJSON).
 */
export interface RawEvent {
  /** ISO-8601 timestamp (content-time). */
  ts: string;
  /** Event type name. */
  event: string;
  /** Contour identifier, e.g. "feature/contour-flow-visual". */
  contour_id: string;
  /** Unique run identifier (32 lowercase hex chars). */
  run_id: string;
  /** Event format version. */
  v?: number;
  /** Additional payload fields. */
  [key: string]: unknown;
}

/**
 * Parsed artifact chip attached to a regulation step.
 */
export interface ArtifactChip {
  kind: string;
  path: string;
  writtenAt: string;
}

/**
 * A single tool call observed while a step is running.
 */
export interface ToolCallInfo {
  name: string;
  status: "pending" | "ok" | "fail";
  startedAt: string | null;
  finishedAt: string | null;
}

/**
 * State of a single regulation step within a contour run.
 */
export interface RegulationStep {
  step: string;
  status: "pending" | "running" | "ok" | "fail" | "skipped";
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  description: string | null;
  toolCalls: ToolCallInfo[];
  outputTokens: number;
  artifacts: ArtifactChip[];
}

/**
 * Approval gate blocking a contour run.
 */
export interface ApprovalGate {
  action: string;
  reason: string | null;
  requiredAt: string;
  resolved: boolean;
  resolvedAt: string | null;
}

/**
 * Derived model of a single contour run.
 */
export interface ContourModel {
  contourId: string;
  type: string;
  name: string;
  branch: string;
  runId: string;
  status: "running" | "finished" | "blocked" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  steps: RegulationStep[];
  approvalGates: ApprovalGate[];
}

/**
 * Options for buildLayout.
 */
export interface BuildLayoutOptions {
  width: number;
  nodeWidth: number;
  nodeHeight: number;
  levelGap: number;
  siblingGap: number;
  contourGap: number;
}

/**
 * Layout node ready for canvas rendering.
 */
export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  title: string;
  description: string | null;
  status: string;
  toolCount: number;
  lastTool: string | null;
  outputTokens: number;
  interactive: boolean;
  parentId: string | null;
  chips: ArtifactChip[];
}

/**
 * Layout edge ready for canvas rendering.
 */
export interface LayoutEdge {
  from: string;
  to: string;
  animated: boolean;
  status: "pending" | "active" | "completed" | "blocked";
}

/**
 * Computed viewport bounding box.
 */
export interface LayoutViewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
