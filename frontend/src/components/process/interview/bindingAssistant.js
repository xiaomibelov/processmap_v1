function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLoose(value) {
  return toText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(aRaw, bRaw) {
  const a = toText(aRaw);
  const b = toText(bRaw);
  if (!a) return b.length;
  if (!b) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

function nameSimilarity(stepNameRaw, nodeNameRaw) {
  const stepName = normalizeLoose(stepNameRaw);
  const nodeName = normalizeLoose(nodeNameRaw);
  if (!stepName || !nodeName) return 0;
  if (stepName === nodeName) return 1;
  if (stepName.includes(nodeName) || nodeName.includes(stepName)) return 0.92;
  const dist = levenshteinDistance(stepName, nodeName);
  const maxLen = Math.max(stepName.length, nodeName.length, 1);
  const levScore = Math.max(0, 1 - dist / maxLen);
  const tokenOverlap = (() => {
    const left = stepName.split(" ").filter(Boolean);
    const right = new Set(nodeName.split(" ").filter(Boolean));
    if (!left.length || !right.size) return 0;
    const hit = left.reduce((acc, token) => acc + (right.has(token) ? 1 : 0), 0);
    return hit / Math.max(left.length, right.size);
  })();
  return Math.max(levScore, tokenOverlap * 0.95);
}

function laneSimilarity(stepLaneRaw, nodeLaneRaw) {
  const stepLane = normalizeLoose(stepLaneRaw);
  const nodeLane = normalizeLoose(nodeLaneRaw);
  if (!stepLane || !nodeLane) return 0;
  if (stepLane === nodeLane) return 1;
  if (stepLane.includes(nodeLane) || nodeLane.includes(stepLane)) return 0.8;
  return 0;
}

function orderSimilarity(stepIndex, nodeIndex, total) {
  const max = Math.max(1, Number(total || 1) - 1);
  const dist = Math.abs(Number(stepIndex || 0) - Number(nodeIndex || 0));
  return Math.max(0, 1 - dist / max);
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function isNodeAssignable(node) {
  const nodeType = normalizeLoose(node?.nodeType);
  const kind = normalizeLoose(node?.bpmnKind);
  return nodeType === "step"
    || nodeType === "message"
    || nodeType === "timer"
    || nodeType === "event_virtual"
    || kind.endsWith("task")
    || kind === "subprocess";
}

export function buildBindingAssistantModel({ timelineView, backendNodes }) {
  const steps = toArray(timelineView).map((step, idx) => ({
    id: toText(step?.id),
    seq: Number(step?.seq || idx + 1) || idx + 1,
    action: toText(step?.action),
    role: toText(step?.role || step?.area || step?.lane_name),
    explicitNodeId: toText(step?.node_id),
    inferredNodeId: toText(step?.node_bind_id),
    inferredBound: !!step?.node_bound,
    index: idx,
  }));

  const nodes = toArray(backendNodes)
    .filter((node) => isNodeAssignable(node))
    .map((node, idx) => ({
      id: toText(node?.id),
      title: toText(node?.title || node?.name || node?.id),
      lane: toText(node?.actorRole || node?.laneName || node?.lane),
      index: idx,
    }))
    .filter((node) => !!node.id);

  const nodeById = {};
  nodes.forEach((node) => {
    nodeById[node.id] = node;
  });

  const explicitByNode = {};
  steps.forEach((step) => {
    if (!step.explicitNodeId) return;
    if (!explicitByNode[step.explicitNodeId]) explicitByNode[step.explicitNodeId] = [];
    explicitByNode[step.explicitNodeId].push(step.id);
  });

  function stepIssueStatus(step) {
    const explicit = step.explicitNodeId;
    if (!explicit) return "missing_binding";
    if (!nodeById[explicit]) return "missing_node";
    if (toArray(explicitByNode[explicit]).length > 1) return "duplicate_node";
    return "";
  }

  const issues = steps
    .map((step) => {
      const status = stepIssueStatus(step);
      if (!status) return null;
      const candidates = nodes
        .map((node) => {
          const nameScore = nameSimilarity(step.action, node.title);
          const laneScore = laneSimilarity(step.role, node.lane);
          const orderScore = orderSimilarity(step.index, node.index, Math.max(steps.length, nodes.length));
          const occupiedByAnotherStep = toArray(explicitByNode[node.id]).some((sid) => sid !== step.id);
          const rawScore = (0.55 * nameScore) + (0.25 * laneScore) + (0.20 * orderScore) - (occupiedByAnotherStep ? 0.15 : 0);
          const score = clamp01(rawScore);
          return {
            id: node.id,
            title: node.title,
            lane: node.lane,
            confidence: score,
            scoreParts: {
              name: Number(nameScore.toFixed(3)),
              lane: Number(laneScore.toFixed(3)),
              order: Number(orderScore.toFixed(3)),
            },
          };
        })
        .sort((a, b) => b.confidence - a.confidence || String(a.title).localeCompare(String(b.title), "ru"))
        .slice(0, 3);

      return {
        stepId: step.id,
        seq: step.seq,
        action: step.action || "Без названия",
        role: step.role || "—",
        status,
        explicitNodeId: step.explicitNodeId,
        inferredNodeId: step.inferredNodeId,
        inferredBound: step.inferredBound,
        topConfidence: Number((candidates[0]?.confidence || 0).toFixed(3)),
        candidates,
      };
    })
    .filter(Boolean);

  const safeAutoBindings = [];
  const reservedNodeIds = new Set();
  issues
    .map((issue) => ({ issue, best: issue.candidates[0] || null }))
    .filter((entry) => !!entry.best && Number(entry.best.confidence || 0) >= 0.85)
    .sort((a, b) => Number(b.best.confidence || 0) - Number(a.best.confidence || 0))
    .forEach(({ issue, best }) => {
      if (reservedNodeIds.has(best.id)) return;
      reservedNodeIds.add(best.id);
      safeAutoBindings.push({
        stepId: issue.stepId,
        nodeId: best.id,
        confidence: Number(best.confidence.toFixed(3)),
      });
    });

  return {
    issues,
    issueCount: issues.length,
    safeAutoBindings,
  };
}
