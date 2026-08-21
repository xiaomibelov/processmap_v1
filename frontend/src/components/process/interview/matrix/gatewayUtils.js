import { formatHHMMFromSeconds, toArray, toText } from "../utils";

function normalizeTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

function inferOutcomeKindFromBranch(branch, metrics) {
  if (Number(metrics?.loopCount || 0) > 0) return "loop";
  if (Number(metrics?.continueCount || 0) > 0) return "continue";
  if (Number(metrics?.failCount || 0) > 0) return "fail";
  const tier = normalizeTier(branch?.tier);
  if (tier === "P2") return "fail";
  const stopReason = toText(branch?.stopReason).toLowerCase();
  if (stopReason === "end") return "fail";
  return "unknown";
}

export function findFirstStepNodeId(nodesRaw) {
  function walk(list) {
    const items = toArray(list);
    for (let i = 0; i < items.length; i += 1) {
      const node = items[i];
      const kind = toText(node?.kind).toLowerCase();
      if (kind === "step") return toText(node?.nodeId);
      if (kind === "decision" || kind === "parallel") {
        const branches = toArray(node?.branches);
        for (let b = 0; b < branches.length; b += 1) {
          const found = walk(branches[b]?.children);
          if (found) return found;
        }
      }
    }
    return "";
  }
  return walk(nodesRaw);
}

export function collectBranchMetrics(nodesRaw, stepMetaByNodeId = {}) {
  const out = {
    stepsCount: 0,
    workSec: 0,
    waitSec: 0,
    totalSec: 0,
    continueCount: 0,
    loopCount: 0,
    failCount: 0,
    continueTarget: "",
    loopTarget: "",
    stepTitles: [],
    firstStepNodeId: "",
  };

  function walk(list) {
    toArray(list).forEach((node) => {
      const kind = toText(node?.kind).toLowerCase();
      if (kind === "step") {
        const nodeId = toText(node?.nodeId);
        const meta = stepMetaByNodeId[nodeId] || {};
        const work = Math.max(0, Number(meta?.workSec || 0));
        const wait = Math.max(0, Number(meta?.waitSec || 0));
        out.stepsCount += 1;
        out.workSec += work;
        out.waitSec += wait;
        out.totalSec += work + wait;
        const title = toText(meta?.title || node?.title || nodeId);
        if (title) out.stepTitles.push(title);
        if (!out.firstStepNodeId && nodeId) out.firstStepNodeId = nodeId;
        return;
      }
      if (kind === "continue") {
        out.continueCount += 1;
        if (!out.continueTarget) out.continueTarget = toText(node?.targetTitle || node?.targetNodeId);
        return;
      }
      if (kind === "loop") {
        out.loopCount += 1;
        if (!out.loopTarget) out.loopTarget = toText(node?.targetTitle || node?.targetNodeId);
        return;
      }
      if (kind === "terminal") {
        out.failCount += 1;
        return;
      }
      if (kind === "decision" || kind === "parallel") {
        toArray(node?.branches).forEach((branch) => walk(branch?.children));
      }
    });
  }

  walk(nodesRaw);
  out.totalSec = out.workSec + out.waitSec;
  if (!out.firstStepNodeId) out.firstStepNodeId = findFirstStepNodeId(nodesRaw);
  return out;
}

export function branchOutcomeLabel(branch, metrics) {
  const kind = inferOutcomeKindFromBranch(branch, metrics);
  if (kind === "loop") return `Петля → ${toText(metrics?.loopTarget || "—")}`;
  if (kind === "continue") return "Дальше";
  if (kind === "fail") return "Сбой";
  return "—";
}

export function branchOutcomeKind(branch, metrics) {
  return inferOutcomeKindFromBranch(branch, metrics);
}

export function formatBranchTime(metrics) {
  const workSec = Math.max(0, Number(metrics?.workSec || 0));
  const waitSec = Math.max(0, Number(metrics?.waitSec || 0));
  const totalSec = Math.max(0, Number(metrics?.totalSec || workSec + waitSec));
  if (workSec <= 0 && waitSec <= 0 && totalSec <= 0) return "—";
  return `work ${formatHHMMFromSeconds(workSec)} • wait ${formatHHMMFromSeconds(waitSec)} • total ${formatHHMMFromSeconds(totalSec)}`;
}

export function summarizeGateway(branchesRaw, metricsByBranchKey = {}) {
  const branches = toArray(branchesRaw);
  const out = {
    branchesCount: branches.length,
    continueCount: 0,
    loopCount: 0,
    failCount: 0,
    primaryLabel: "",
    primaryTier: "",
    primaryMetrics: null,
  };
  branches.forEach((branch, idx) => {
    const branchKey = toText(branch?.key) || String.fromCharCode(65 + (idx % 26));
    const metrics = metricsByBranchKey[branchKey] || collectBranchMetrics(branch?.children, {});
    const kind = inferOutcomeKindFromBranch(branch, metrics);
    if (kind === "continue") out.continueCount += 1;
    if (kind === "loop") out.loopCount += 1;
    if (kind === "fail") out.failCount += 1;
    if (branch?.isPrimary || (!out.primaryLabel && idx === 0)) {
      out.primaryLabel = toText(branch?.label) || `Ветка ${idx + 1}`;
      out.primaryTier = normalizeTier(branch?.tier);
      out.primaryMetrics = metrics;
    }
  });
  return out;
}

