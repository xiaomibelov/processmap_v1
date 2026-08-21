import { toArray, toText } from "./utils";

function normalizeTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

export default function GatewayBranchesTree({
  step,
  betweenItem,
  branches,
  getBranchExpanded,
  onPatchBranchExpand,
  onCollapseAllBranches,
  onExpandCurrentBranch,
  renderNodes,
}) {
  const fromNo = toText(betweenItem?.fromGraphNo || step?.seq_label || step?.seq || "?");
  const currentBranch = branches.find((branch) => !branch?.isPrimary) || branches[0] || null;
  const currentBranchKey = toText(currentBranch?.key);
  const currentTier = normalizeTier(currentBranch?.tier);
  const breadcrumbStep = currentBranchKey ? `${fromNo}.${currentBranchKey}.1` : `${fromNo}.1`;

  return (
    <div className="interviewBranchTree" data-testid="interview-branches-tree">
      <div className="interviewBranchViewActions">
        <button type="button" className="secondaryBtn smallBtn" onClick={onCollapseAllBranches}>
          Свернуть все
        </button>
        <button type="button" className="secondaryBtn smallBtn" onClick={() => onExpandCurrentBranch(currentBranchKey)}>
          Раскрыть текущую ветку
        </button>
      </div>
      {currentBranch ? (
        <div className="interviewBranchBreadcrumb">
          Gateway #{fromNo} → Ветка "{toText(currentBranch?.label) || currentBranchKey}" ({currentTier}) → Шаг {breadcrumbStep}
        </div>
      ) : null}
      <div className="interviewBranchTreeRail">
        {toArray(branches).map((branch, branchIdx) => {
          const branchKey = toText(branch?.key) || String.fromCharCode(65 + (branchIdx % 26));
          const branchLabel = toText(branch?.label) || `Ветка ${branchIdx + 1}`;
          const branchTier = normalizeTier(branch?.tier);
          const branchNodes = toArray(branch?.children);
          const branchTimeLabel = toText(branch?.time_summary?.label_with_loop || branch?.time_summary?.label);
          const expanded = !!getBranchExpanded?.(branch);
          return (
            <div
              key={`tree_${toText(step?.id)}_${branchKey}_${branchIdx + 1}`}
              className={[
                "interviewGatewayPreviewBranch interviewBranchTreeBranch",
                branch?.isPrimary ? "primary" : "",
                branchTier ? `tier-${branchTier.toLowerCase()}` : "tier-none",
                branchNodes.some((node) => toText(node?.kind).toLowerCase() === "loop") ? "loop" : "",
              ].filter(Boolean).join(" ")}
            >
              <div className="interviewGatewayPreviewHead">
                <span className="interviewGatewayPreviewLabel">{branchLabel}</span>
                <span className={`interviewGatewayPreviewTag tier tier-${branchTier.toLowerCase()}`}>{branchTier}</span>
                {branch?.isPrimary ? <span className="interviewGatewayPreviewTag">основная</span> : null}
                {branch?.isPrimary && toText(branch?.primaryReasonLabel) ? (
                  <span className="interviewGatewayPreviewTag explain" title={toText(branch?.primaryReasonLabel)}>
                    {toText(branch?.primaryReasonLabel)}
                  </span>
                ) : null}
                {!branch?.isPrimary && toText(branch?.nonPrimaryReasonLabel) ? (
                  <span className="interviewGatewayPreviewTag muted" title={toText(branch?.nonPrimaryReasonLabel)}>
                    {toText(branch?.nonPrimaryReasonLabel)}
                  </span>
                ) : null}
                {branchTimeLabel && branchTimeLabel !== "—" ? <span className="badge">⏱ {branchTimeLabel}</span> : null}
                <button
                  type="button"
                  className="secondaryBtn smallBtn ml-auto"
                  onClick={() => onPatchBranchExpand?.(branchKey, !expanded)}
                >
                  {expanded ? "Свернуть" : "Показать"}
                </button>
              </div>
              {expanded ? renderNodes?.(branchNodes, `${fromNo}.${branchKey}`, `${toText(step?.id)}_tree_${branchKey}`) : (
                <div className="interviewGatewayPreviewHint">Шаги ветки скрыты.</div>
              )}
              {branch?.continueRestricted ? (
                <div className="interviewGatewayPreviewHint">
                  {toText(branch?.continueRestrictionText) || "Continue возможно только на шаги mainline ниже текущего gateway."}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
