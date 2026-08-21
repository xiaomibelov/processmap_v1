import { toArray, toText } from "./utils";

function normalizeTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

export default function GatewayBranchesCards({
  step,
  betweenItem,
  branches,
  summarizeBranchOutcome,
  getBranchExpanded,
  onPatchBranchExpand,
  onCollapseAllBranches,
  onExpandCurrentBranch,
  renderNodes,
}) {
  const fromNo = toText(betweenItem?.fromGraphNo || step?.seq_label || step?.seq || "?");
  const currentBranch = branches.find((branch) => !branch?.isPrimary) || branches[0] || null;
  const currentBranchKey = toText(currentBranch?.key);

  return (
    <div className="interviewBranchCards" data-testid="interview-branches-cards">
      <div className="interviewBranchViewActions">
        <button type="button" className="secondaryBtn smallBtn" onClick={onCollapseAllBranches}>
          Свернуть все
        </button>
        <button type="button" className="secondaryBtn smallBtn" onClick={() => onExpandCurrentBranch(currentBranchKey)}>
          Раскрыть текущую ветку
        </button>
      </div>
      <div className="interviewBranchCardsGrid">
        {toArray(branches).map((branch, branchIdx) => {
          const branchKey = toText(branch?.key) || String.fromCharCode(65 + (branchIdx % 26));
          const branchLabel = toText(branch?.label) || `Ветка ${branchIdx + 1}`;
          const branchTier = normalizeTier(branch?.tier);
          const branchNodes = toArray(branch?.children);
          const branchTimeLabel = toText(branch?.time_summary?.label_with_loop || branch?.time_summary?.label) || "—";
          const outcome = summarizeBranchOutcome?.(branchNodes) || { outcome: "—", stepsCount: 0 };
          const expanded = !!getBranchExpanded?.(branch);
          return (
            <article
              key={`cards_${toText(step?.id)}_${branchKey}_${branchIdx + 1}`}
              className={[
                "interviewBranchCard",
                branch?.isPrimary ? "primary" : "",
                `tier-${branchTier.toLowerCase()}`,
              ].join(" ")}
            >
              <header className="interviewBranchCardHead">
                <div className="interviewBranchCardTitleRow">
                  <span className="interviewGatewayPreviewLabel">{branchLabel}</span>
                  <span className={`interviewGatewayPreviewTag tier tier-${branchTier.toLowerCase()}`}>{branchTier}</span>
                  {branch?.isPrimary ? <span className="interviewGatewayPreviewTag">primary</span> : null}
                </div>
                <div className="interviewBranchCardMetrics">
                  <span className="badge">outcome: {outcome.outcome}</span>
                  <span className="badge">steps: {Number(outcome.stepsCount || 0)}</span>
                  <span className="badge">⏱ {branchTimeLabel}</span>
                </div>
                {branch?.isPrimary && toText(branch?.primaryReasonLabel) ? (
                  <div className="interviewGatewayPreviewTag explain">{toText(branch?.primaryReasonLabel)}</div>
                ) : null}
                {!branch?.isPrimary && toText(branch?.nonPrimaryReasonLabel) ? (
                  <div className="interviewGatewayPreviewTag muted">{toText(branch?.nonPrimaryReasonLabel)}</div>
                ) : null}
              </header>
              <div className="interviewBranchCardBody">
                {expanded ? renderNodes?.(branchNodes, `${fromNo}.${branchKey}`, `${toText(step?.id)}_cards_${branchKey}`) : null}
                {branch?.continueRestricted ? (
                  <div className="interviewGatewayPreviewHint">
                    {toText(branch?.continueRestrictionText) || "Continue возможно только на шаги mainline ниже текущего gateway."}
                  </div>
                ) : null}
              </div>
              <footer className="interviewBranchCardFoot">
                <button
                  type="button"
                  className="secondaryBtn smallBtn"
                  onClick={() => onPatchBranchExpand?.(branchKey, !expanded)}
                >
                  {expanded ? "Скрыть шаги" : "Показать шаги"}
                </button>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
