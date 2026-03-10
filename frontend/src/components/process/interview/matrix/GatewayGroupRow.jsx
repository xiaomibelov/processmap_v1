import { useState } from "react";
import { formatHHMMFromSeconds, toText } from "../utils";
import CompareBranchesPopover from "./CompareBranchesPopover";
import GatewayBranchesTable from "./GatewayBranchesTable";
import { summarizeGateway } from "./gatewayUtils";

function normalizeTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

export default function GatewayGroupRow({
  gatewayId = "",
  gatewayLabel = "",
  gatewaySubtitle = "",
  branches = [],
  metricsByBranchKey = {},
  expanded = false,
  showIds = false,
  selectedBranchKey = "",
  onToggleExpanded,
  onToggleShowIds,
  onSelectBranch,
  onOpenBranchSteps,
  onSetPrimaryBranch,
  onCollapseAllBranches,
  onExpandAllBranches,
  onCopySummary,
}) {
  const [compareOpen, setCompareOpen] = useState(false);
  const summary = summarizeGateway(branches, metricsByBranchKey);
  const primaryMetrics = summary?.primaryMetrics || {};
  const primaryTier = normalizeTier(summary?.primaryTier);

  return (
    <div className={`interviewGatewayGroupRow ${expanded ? "isExpanded" : ""}`}>
      <div className="interviewGatewayHeaderRow">
        <div className="interviewGatewayHeaderMain">
          <span className="interviewGatewayIcon" aria-hidden="true">◇</span>
          <span className="interviewGatewayLabel">{toText(gatewayLabel) || "Gateway decision"}</span>
          {toText(gatewaySubtitle) ? <span className="muted small">{gatewaySubtitle}</span> : null}
        </div>
        <div className="interviewGatewayHeaderMeta">
          <span className="badge">Ветки: {Number(summary?.branchesCount || 0)}</span>
          <span className="badge">
            Primary: {toText(summary?.primaryLabel || "—")} ({primaryTier})
          </span>
          <span className="badge muted">
            Continue: {Number(summary?.continueCount || 0)} • Loop: {Number(summary?.loopCount || 0)} • Fail: {Number(summary?.failCount || 0)}
          </span>
          <span className="badge muted">
            steps: {Number(primaryMetrics?.stepsCount || 0)} • total: {formatHHMMFromSeconds(primaryMetrics?.totalSec || 0)}
          </span>
          <button type="button" className="secondaryBtn tinyBtn" onClick={() => onToggleExpanded?.(gatewayId)}>
            {expanded ? "Свернуть" : "Развернуть"}
          </button>
          <button type="button" className="secondaryBtn tinyBtn" onClick={() => setCompareOpen((prev) => !prev)}>
            ⋯
          </button>
        </div>
      </div>

      {compareOpen ? (
        <CompareBranchesPopover
          open={compareOpen}
          branches={branches}
          metricsByBranchKey={metricsByBranchKey}
          onClose={() => setCompareOpen(false)}
        />
      ) : null}

      {expanded ? (
        <GatewayBranchesTable
          gatewayId={gatewayId}
          branches={branches}
          metricsByBranchKey={metricsByBranchKey}
          selectedBranchKey={selectedBranchKey}
          showIds={showIds}
          onToggleShowIds={onToggleShowIds}
          onSelectBranch={onSelectBranch}
          onOpenBranchSteps={onOpenBranchSteps}
          onSetPrimaryBranch={onSetPrimaryBranch}
          onCollapseAll={onCollapseAllBranches}
          onExpandAll={onExpandAllBranches}
          onCopySummary={onCopySummary}
          onOpenCompare={() => setCompareOpen(true)}
        />
      ) : null}
    </div>
  );
}

