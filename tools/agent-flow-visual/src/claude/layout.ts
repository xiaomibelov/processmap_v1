import type { claude, LayoutEdge, LayoutNode, LayoutViewport } from "agent-flow-core";

export interface ClaudeLayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  levelGap: number;
  siblingGap: number;
}

const DEFAULTS: ClaudeLayoutOptions = {
  nodeWidth: 180,
  nodeHeight: 90,
  levelGap: 120,
  siblingGap: 48,
};

export interface ClaudeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  viewport: LayoutViewport;
}

export function buildClaudeLayout(
  model: claude.SessionModel,
  options?: Partial<ClaudeLayoutOptions>
): ClaudeLayout {
  const opts = { ...DEFAULTS, ...options };
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  const main = model.agents.get("main");
  if (!main) {
    return { nodes, edges, viewport: { minX: 0, minY: 0, maxX: opts.nodeWidth, maxY: opts.nodeHeight } };
  }

  const rootX = 0;
  const rootY = 0;
  nodes.push(makeNode(main, rootX, rootY, opts));

  // Direct children of main (subagents and workflow groups).
  const directChildren = [...model.agents.values()].filter((a) => a.parentId === "main" && a.id !== "main");
  directChildren.sort((a, b) => model.spawnOrder.indexOf(a.id) - model.spawnOrder.indexOf(b.id));

  let childX = rootX;
  const childY = rootY + opts.nodeHeight + opts.levelGap;
  const groupChildrenMap = new Map<string, claude.AgentInfo[]>();

  for (const child of directChildren) {
    nodes.push(makeNode(child, childX, childY, opts, "main"));
    edges.push(makeEdge("main", child.id, child.status));

    if (child.kind === "workflowGroup") {
      const wfSubs = [...model.agents.values()].filter((a) => a.parentId === child.id);
      wfSubs.sort((a, b) => model.spawnOrder.indexOf(a.id) - model.spawnOrder.indexOf(b.id));
      groupChildrenMap.set(child.id, wfSubs);

      let subX = childX;
      const subY = childY + opts.nodeHeight + opts.levelGap;
      for (const sub of wfSubs) {
        nodes.push(makeNode(sub, subX, subY, opts, child.id));
        edges.push(makeEdge(child.id, sub.id, sub.status));
        subX += opts.nodeWidth + opts.siblingGap;
      }
    }

    childX += opts.nodeWidth + opts.siblingGap;
  }

  // Center main over its direct children.
  if (directChildren.length > 0) {
    const rowWidth = directChildren.length * opts.nodeWidth + (directChildren.length - 1) * opts.siblingGap;
    const mainNode = nodes.find((n) => n.id === "main")!;
    mainNode.x = Math.max(0, (rowWidth - opts.nodeWidth) / 2);
  }

  const viewport = computeViewport(nodes, opts);
  return { nodes, edges, viewport };
}

function makeNode(
  agent: claude.AgentInfo,
  x: number,
  y: number,
  opts: ClaudeLayoutOptions,
  parentId: string | null = null
): LayoutNode {
  const last = agent.toolCalls[agent.toolCalls.length - 1];
  return {
    id: agent.id,
    x,
    y,
    width: opts.nodeWidth,
    height: opts.nodeHeight,
    label: agent.agentType ?? agent.id,
    title: agent.agentType ?? agent.id,
    description: agent.description ?? null,
    status: mapStatus(agent.status),
    toolCount: agent.toolCalls.length,
    lastTool: last?.name ?? null,
    outputTokens: agent.outputTokens,
    interactive: agent.status === "running",
    parentId,
    chips: [],
  };
}

function makeEdge(from: string, to: string, targetStatus: claude.AgentStatus): LayoutEdge {
  return {
    from,
    to,
    animated: targetStatus === "running",
    status: mapEdgeStatus(targetStatus),
  };
}

function mapStatus(status: claude.AgentStatus): string {
  switch (status) {
    case "running":
      return "running";
    case "idle":
      return "idle";
    case "done":
      return "ok";
    case "failed":
      return "fail";
    case "stopped":
      return "stopped";
    default:
      return "pending";
  }
}

function mapEdgeStatus(status: claude.AgentStatus): LayoutEdge["status"] {
  switch (status) {
    case "running":
      return "active";
    case "done":
      return "completed";
    case "failed":
      return "blocked";
    case "stopped":
      return "blocked";
    default:
      return "pending";
  }
}

function computeViewport(nodes: LayoutNode[], opts: ClaudeLayoutOptions): LayoutViewport {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: opts.nodeWidth, maxY: opts.nodeHeight };
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
