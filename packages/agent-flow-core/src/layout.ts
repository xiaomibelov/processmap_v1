import type {
  BuildLayoutOptions,
  ContourModel,
  LayoutEdge,
  LayoutNode,
  LayoutViewport,
} from "./types.js";

const DEFAULT_OPTIONS: BuildLayoutOptions = {
  width: 1200,
  nodeWidth: 180,
  nodeHeight: 72,
  levelGap: 48,
  siblingGap: 28,
  contourGap: 80,
};

function mergeOptions(
  options?: Partial<BuildLayoutOptions>
): BuildLayoutOptions {
  return { ...DEFAULT_OPTIONS, ...options };
}

/**
 * Build a deterministic hierarchical layout for the given contour models.
 */
export function buildLayout(
  contours: ContourModel[],
  options?: Partial<BuildLayoutOptions>
): { nodes: LayoutNode[]; edges: LayoutEdge[]; viewport: LayoutViewport } {
  const opts = mergeOptions(options);
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  let contourY = 0;

  for (const contour of contours) {
    const rootId = `${contour.runId}:root`;
    const maxChipsRowHeight = Math.max(
      0,
      Math.ceil(
        contour.steps.reduce((sum, s) => sum + s.artifacts.length, 0) / 4
      ) * 22
    );
    const rootHeight = opts.nodeHeight + maxChipsRowHeight;

    // Root node spans above the step row.
    const rootX = opts.levelGap;
    const rootY = contourY;
    nodes.push({
      id: rootId,
      x: rootX,
      y: rootY,
      width: opts.nodeWidth,
      height: rootHeight,
      label: contour.name,
      status: contour.status,
      chips: [],
    });

    let stepX = rootX + opts.nodeWidth + opts.levelGap;
    const stepY = rootY;

    const stepIds: string[] = [];
    for (let i = 0; i < contour.steps.length; i++) {
      const step = contour.steps[i];
      const stepId = `${contour.runId}:step:${step.step}`;
      stepIds.push(stepId);

      const stepHeight = opts.nodeHeight + step.artifacts.length * 22;
      nodes.push({
        id: stepId,
        x: stepX,
        y: stepY,
        width: opts.nodeWidth,
        height: stepHeight,
        label: step.step,
        status: step.status,
        chips: step.artifacts,
      });

      stepX += opts.nodeWidth + opts.levelGap;
    }

    // Edges: root -> first step, step -> step, step -> gate -> next step.
    if (stepIds.length > 0) {
      edges.push({
        from: rootId,
        to: stepIds[0],
        animated: contour.steps[0]?.status === "running",
        status: edgeStatusForStep(contour.steps[0]),
      });
    }

    for (let i = 0; i < stepIds.length - 1; i++) {
      const nextStep = contour.steps[i + 1];
      edges.push({
        from: stepIds[i],
        to: stepIds[i + 1],
        animated: nextStep.status === "running",
        status: edgeStatusForStep(nextStep),
      });
    }

    // Approval gates rendered below the step row, connected to the step that triggered them.
    const unresolvedGate = contour.approvalGates.find((g) => !g.resolved);
    if (unresolvedGate) {
      // Attach to the first non-ok step or the last step.
      const attachIndex = Math.max(
        0,
        contour.steps.findIndex((s) => s.status !== "ok") - 1
      );
      const gateId = `${contour.runId}:gate:0`;
      nodes.push({
        id: gateId,
        x: nodes.find((n) => n.id === stepIds[attachIndex])?.x ?? stepX,
        y: stepY + opts.nodeHeight + opts.siblingGap,
        width: opts.nodeWidth,
        height: opts.nodeHeight,
        label: unresolvedGate.action,
        status: "blocked",
        chips: [],
      });
      edges.push({
        from: stepIds[attachIndex] ?? rootId,
        to: gateId,
        animated: false,
        status: "blocked",
      });
      contourY += opts.nodeHeight + opts.siblingGap + opts.contourGap;
    }

    const rowHeight = Math.max(
      rootHeight,
      opts.nodeHeight + Math.max(...contour.steps.map((s) => s.artifacts.length)) * 22
    );
    contourY += rowHeight + opts.contourGap;
  }

  // Compute viewport.
  const viewport = computeViewport(nodes);

  return { nodes, edges, viewport };
}

function edgeStatusForStep(
  step: ContourModel["steps"][number]
): LayoutEdge["status"] {
  if (step.status === "running") return "active";
  if (step.status === "ok") return "completed";
  if (step.status === "fail") return "blocked";
  return "pending";
}

function computeViewport(nodes: LayoutNode[]): LayoutViewport {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: DEFAULT_OPTIONS.width, maxY: 400 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  return { minX, minY, maxX, maxY };
}
