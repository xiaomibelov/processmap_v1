import { useMemo, useState } from "react";
import { formatHHMMFromSeconds, toArray, toText } from "../utils";
import { branchOutcomeLabel, collectBranchMetrics, formatBranchTime, summarizeGateway } from "./gatewayUtils";

function resolveKey(item, idx) {
  return toText(item?.key) || String.fromCharCode(65 + (idx % 26));
}

export default function NestedDecision({
  node,
  pathKey = "",
  stepMetaByNodeId = {},
  onOpenBranchSteps,
}) {
  const [expanded, setExpanded] = useState(false);
  const branches = toArray(node?.branches);
  const metricsByKey = useMemo(() => {
    const out = {};
    branches.forEach((branch, idx) => {
      const key = resolveKey(branch, idx);
      out[key] = collectBranchMetrics(branch?.children, stepMetaByNodeId);
    });
    return out;
  }, [branches, stepMetaByNodeId]);
  const summary = useMemo(() => summarizeGateway(branches, metricsByKey), [branches, metricsByKey]);

  return (
    <div className="interviewNestedDecision">
      <div className="interviewNestedDecisionHead">
        <span className="badge warn">Nested decision</span>
        <span className="interviewNestedDecisionTitle">{toText(node?.title) || "Решение"}</span>
        <span className="muted small">
          веток: {branches.length} • steps: {Number(summary?.primaryMetrics?.stepsCount || 0)} • total: {formatHHMMFromSeconds(summary?.primaryMetrics?.totalSec || 0)}
        </span>
        <button type="button" className="secondaryBtn tinyBtn ml-auto" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Свернуть" : "Развернуть"}
        </button>
      </div>
      {expanded ? (
        <div className="interviewNestedDecisionBody">
          {branches.map((branch, idx) => {
            const branchKey = resolveKey(branch, idx);
            const metrics = metricsByKey[branchKey] || {};
            const label = toText(branch?.label) || `Ветка ${idx + 1}`;
            return (
              <div key={`${pathKey}_${branchKey}`} className="interviewNestedDecisionBranch">
                <div className="interviewNestedDecisionBranchMain">
                  <span>{label}</span>
                  <span className="badge muted">{branchOutcomeLabel(branch, metrics)}</span>
                  <span className="muted small">steps: {Number(metrics?.stepsCount || 0)}</span>
                  <span className="muted small">{formatBranchTime(metrics)}</span>
                </div>
                <button
                  type="button"
                  className="secondaryBtn tinyBtn"
                  onClick={() => onOpenBranchSteps?.({
                    gatewayId: `${pathKey}:${toText(node?.nodeId || node?.title || "nested")}`,
                    gatewayLabel: toText(node?.title) || "Nested decision",
                    branchKey,
                    branchLabel: label,
                    branchTier: toText(branch?.tier),
                    nodes: toArray(branch?.children),
                    metrics,
                    outcomeLabel: branchOutcomeLabel(branch, metrics),
                  })}
                >
                  Открыть шаги ветки
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

