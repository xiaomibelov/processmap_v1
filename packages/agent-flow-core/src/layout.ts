import type {
  BuildLayoutOptions,
  ContourModel,
  LayoutEdge,
  LayoutNode,
  LayoutViewport,
  RegulationStep,
} from "./types.js";

const DEFAULT_OPTIONS: BuildLayoutOptions = {
  width: 1200,
  nodeWidth: 180,
  nodeHeight: 90,
  levelGap: 64,
  siblingGap: 32,
  contourGap: 120,
};

function mergeOptions(
  options?: Partial<BuildLayoutOptions>
): BuildLayoutOptions {
  return { ...DEFAULT_OPTIONS, ...options };
}

function lastToolName(step: RegulationStep): string | null {
  if (step.toolCalls.length === 0) return null;
  return step.toolCalls[step.toolCalls.length - 1].name;
}

function countRunningToolCalls(step: RegulationStep): number {
  return step.toolCalls.filter((t) => t.status === "pending").length;
}

/**
 * Build a deterministic hierarchical layout for the given contour models.
 *
 * Each contour becomes a parent node with its regulation steps arranged as
 * children below it. Multiple contours stack vertically so the graph reads
 * top-to-bottom like the zoetrope reference.
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

    // Height for artifact chips rendered inside the node.
    const maxArtifactRows = Math.max(
      0,
      Math.ceil(
        contour.steps.reduce((sum, s) => sum + s.artifacts.length, 0) / 4
      ) * 22
    );
    const rootHeight = opts.nodeHeight + maxArtifactRows;

    // Compute children (step) layout first so the root can be centered.
    const childIds: string[] = [];
    const childNodes: LayoutNode[] = [];
    let childX = 0;
    for (let i = 0; i < contour.steps.length; i++) {
      const step = contour.steps[i];
      const stepId = `${contour.runId}:step:${step.step}`;
      childIds.push(stepId);

      const toolCount = step.toolCalls.length;
      const lastTool = lastToolName(step);
      const runningTools = countRunningToolCalls(step);
      const stepHeight =
        opts.nodeHeight + Math.max(0, step.artifacts.length - 1) * 22;

      childNodes.push({
        id: stepId,
        x: childX,
        y: 0, // resolved below once root is placed
        width: opts.nodeWidth,
        height: stepHeight,
        label: step.step,
        title: step.step,
        description: step.description,
        status: step.status,
        toolCount,
        lastTool,
        outputTokens: step.outputTokens,
        interactive: step.status === "running" && runningTools > 0,
        parentId: rootId,
        chips: step.artifacts,
      });

      childX += opts.nodeWidth + opts.siblingGap;
    }

    // Root node centered over its children row.
    const childrenWidth = Math.max(
      opts.nodeWidth,
      childNodes.length * opts.nodeWidth +
        Math.max(0, childNodes.length - 1) * opts.siblingGap
    );
    const rootX = (childrenWidth - opts.nodeWidth) / 2;
    const rootY = contourY;

    nodes.push({
      id: rootId,
      x: rootX,
      y: rootY,
      width: opts.nodeWidth,
      height: rootHeight,
      label: contour.name,
      title: contour.name,
      description: contour.branch,
      status: contour.status,
      toolCount: contour.steps.reduce((sum, s) => sum + s.toolCalls.length, 0),
      lastTool: null,
      outputTokens: contour.steps.reduce((sum, s) => sum + s.outputTokens, 0),
      interactive: contour.status === "running",
      parentId: null,
      chips: [],
    });

    // Place children below the root.
    const childRowY = rootY + rootHeight + opts.levelGap;
    const rowOffset = childNodes.length > 0 ? (childrenWidth - childX + opts.siblingGap) / 2 : 0;
    for (const child of childNodes) {
      child.x += rowOffset;
      child.y = childRowY;
    }
    nodes.push(...childNodes);

    // Edges: root -> each child, and sequential child -> child.
    for (const childId of childIds) {
      edges.push({
        from: rootId,
        to: childId,
        animated: contour.status === "running",
        status: edgeStatusForModel(contour.status),
      });
    }

    for (let i = 0; i < childIds.length - 1; i++) {
      const nextStep = contour.steps[i + 1];
      edges.push({
        from: childIds[i],
        to: childIds[i + 1],
        animated: nextStep.status === "running",
        status: edgeStatusForStep(nextStep),
      });
    }

    // Approval gates rendered as a child-like node below the step that triggered them.
    const unresolvedGate = contour.approvalGates.find((g) => !g.resolved);
    if (unresolvedGate) {
      const attachIndex = Math.max(
        0,
        contour.steps.findIndex((s) => s.status !== "ok") - 1
      );
      const attachNode =
        childNodes.find((n) => n.id === childIds[attachIndex]) ??
        nodes[nodes.length - 1];
      const gateId = `${contour.runId}:gate:0`;
      nodes.push({
        id: gateId,
        x: attachNode.x,
        y: childRowY + opts.nodeHeight + opts.siblingGap,
        width: opts.nodeWidth,
        height: opts.nodeHeight,
        label: unresolvedGate.action,
        title: unresolvedGate.action,
        description: unresolvedGate.reason,
        status: "blocked",
        toolCount: 0,
        lastTool: null,
        outputTokens: 0,
        interactive: false,
        parentId: rootId,
        chips: [],
      });
      edges.push({
        from: childIds[attachIndex] ?? rootId,
        to: gateId,
        animated: false,
        status: "blocked",
      });
      contourY += opts.nodeHeight + opts.siblingGap + opts.contourGap;
    }

    const rowHeight = Math.max(
      rootHeight + opts.levelGap + opts.nodeHeight,
      rootHeight +
        opts.levelGap +
        opts.nodeHeight +
        Math.max(...contour.steps.map((s) => s.artifacts.length)) * 22
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

function edgeStatusForModel(
  status: ContourModel["status"]
): LayoutEdge["status"] {
  if (status === "running") return "active";
  if (status === "finished") return "completed";
  if (status === "blocked") return "blocked";
  if (status === "cancelled") return "blocked";
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
