import { useMemo, useState } from "react";
import { toArray, toText } from "../utils";
import BranchRow from "./BranchRow";

export default function GatewayBranchesTable({
  gatewayId = "",
  branches = [],
  metricsByBranchKey = {},
  selectedBranchKey = "",
  showIds = false,
  onToggleShowIds,
  onSelectBranch,
  onOpenBranchSteps,
  onSetPrimaryBranch,
  onCollapseAll,
  onExpandAll,
  onCopySummary,
  onOpenCompare,
}) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const normalizedRows = useMemo(
    () => toArray(branches).map((branch, idx) => ({
      branch,
      branchKey: toText(branch?.key) || String.fromCharCode(65 + (idx % 26)),
    })),
    [branches],
  );

  return (
    <div className="interviewGatewayBranchesTable">
      <div className="interviewGatewayBranchesControls">
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => setControlsOpen((prev) => !prev)}>
          Управление ▾
        </button>
        {controlsOpen ? (
          <div className="interviewGatewayControlsMenu">
            <button type="button" className="interviewGatewayControlsItem" onClick={() => onCollapseAll?.(gatewayId)}>
              Свернуть все ветки
            </button>
            <button type="button" className="interviewGatewayControlsItem" onClick={() => onExpandAll?.(gatewayId)}>
              Раскрыть все ветки
            </button>
            <button type="button" className="interviewGatewayControlsItem" onClick={() => onToggleShowIds?.(gatewayId)}>
              {showIds ? "Скрыть IDs" : "Показать IDs"}
            </button>
            <button type="button" className="interviewGatewayControlsItem" onClick={() => onCopySummary?.(gatewayId)}>
              Копировать summary
            </button>
            <button type="button" className="interviewGatewayControlsItem" onClick={() => onOpenCompare?.(gatewayId)}>
              Сравнить ветки
            </button>
          </div>
        ) : null}
      </div>

      <div className="interviewGatewayBranchesHead">
        <div>Branch</div>
        <div>Tier</div>
        <div>Outcome</div>
        <div>Steps</div>
        <div>Time</div>
        <div>Primary</div>
        <div>Action</div>
      </div>
      <div className="interviewGatewayBranchesBody">
        {normalizedRows.map(({ branch, branchKey }) => (
          <BranchRow
            key={`${gatewayId}_${branchKey}`}
            branch={branch}
            branchKey={branchKey}
            metrics={metricsByBranchKey[branchKey]}
            selected={selectedBranchKey === branchKey}
            showIds={showIds}
            onSelectBranch={onSelectBranch}
            onOpenSteps={onOpenBranchSteps}
            onSetPrimaryBranch={onSetPrimaryBranch}
          />
        ))}
      </div>
    </div>
  );
}

