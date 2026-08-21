import { toText } from "../utils";
import { branchOutcomeKind, branchOutcomeLabel, formatBranchTime } from "./gatewayUtils";

function normalizeTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

export default function BranchRow({
  branch,
  branchKey = "",
  metrics,
  selected = false,
  showIds = false,
  onSelectBranch,
  onOpenSteps,
  onSetPrimaryBranch,
}) {
  const tier = normalizeTier(branch?.tier);
  const outcomeKind = branchOutcomeKind(branch, metrics);
  const outcomeLabel = branchOutcomeLabel(branch, metrics);
  const isPrimary = !!branch?.isPrimary;
  return (
    <div className={`interviewGatewayBranchRow ${selected ? "isSelected" : ""}`}>
      <div className="interviewGatewayBranchCell branch">
        <button
          type="button"
          className="interviewGatewayBranchLink"
          onClick={() => onSelectBranch?.(branchKey)}
          title={showIds ? `branch key: ${branchKey}` : ""}
        >
          {toText(branch?.label) || "—"}
        </button>
        {showIds ? <span className="muted small">id: {branchKey || "—"}</span> : null}
      </div>
      <div className="interviewGatewayBranchCell tier">
        <span className={`tier tier-${tier.toLowerCase()}`}>{tier}</span>
      </div>
      <div className="interviewGatewayBranchCell outcome">
        <span className={`badge ${outcomeKind === "fail" ? "err" : outcomeKind === "loop" ? "warn" : outcomeKind === "continue" ? "ok" : "muted"}`}>
          {outcomeLabel}
        </span>
      </div>
      <div className="interviewGatewayBranchCell steps">
        {Number(metrics?.stepsCount || 0)}
      </div>
      <div className="interviewGatewayBranchCell time">
        {formatBranchTime(metrics)}
      </div>
      <div className="interviewGatewayBranchCell primary">
        {isPrimary ? (
          <span className="badge ok">Primary</span>
        ) : (
          <button
            type="button"
            className="secondaryBtn tinyBtn"
            onClick={() => onSetPrimaryBranch?.(branchKey)}
            disabled={!onSetPrimaryBranch}
            title={!onSetPrimaryBranch ? "Смена primary недоступна в этом режиме" : "Сделать primary"}
          >
            Сделать primary
          </button>
        )}
      </div>
      <div className="interviewGatewayBranchCell actions">
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => onOpenSteps?.(branchKey)}>
          Шаги
        </button>
      </div>
    </div>
  );
}

