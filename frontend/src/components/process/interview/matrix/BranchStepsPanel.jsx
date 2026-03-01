import { useMemo } from "react";
import { formatHHMMFromSeconds, toArray, toText } from "../utils";
import BranchStepsList from "./BranchStepsList";

export default function BranchStepsPanel({
  open = false,
  panelState = null,
  stepMetaByNodeId = {},
  onClose,
  onJumpToStep,
  onOpenDiagram,
  onOpenNestedBranch,
}) {
  const context = panelState && typeof panelState === "object" ? panelState : {};
  const metrics = context?.metrics && typeof context.metrics === "object" ? context.metrics : {};
  const nodes = toArray(context?.nodes);
  const canJump = !!toText(context?.firstStepId);
  const copyText = useMemo(
    () => `${toText(context?.gatewayId || "")}:${toText(context?.branchKey || "")}:${toText(context?.branchLabel || "")}`.trim(),
    [context],
  );

  if (!open) return null;

  return (
    <div className="interviewBranchPanelOverlay" role="presentation" onClick={() => onClose?.()}>
      <aside
        className="interviewBranchPanel"
        role="dialog"
        aria-label="Шаги ветки"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="interviewBranchPanelHead">
          <div className="interviewBranchPanelTitle">
            Ветка: {toText(context?.branchLabel || "—")}
          </div>
          <button type="button" className="secondaryBtn tinyBtn" onClick={() => onClose?.()}>
            Закрыть
          </button>
        </div>
        <div className="interviewBranchPanelMeta muted small">
          {toText(context?.branchTier) ? `tier: ${toText(context?.branchTier)} • ` : ""}
          {toText(context?.outcomeLabel) ? `outcome: ${toText(context?.outcomeLabel)} • ` : ""}
          steps: {Number(metrics?.stepsCount || 0)} • work: {formatHHMMFromSeconds(metrics?.workSec || 0)} • wait: {formatHHMMFromSeconds(metrics?.waitSec || 0)} • total: {formatHHMMFromSeconds(metrics?.totalSec || 0)}
        </div>
        <div className="interviewBranchPanelBody">
          <BranchStepsList
            nodes={nodes}
            stepMetaByNodeId={stepMetaByNodeId}
            onOpenBranchSteps={onOpenNestedBranch}
            pathPrefix={`${toText(context?.gatewayId)}.${toText(context?.branchKey)}`}
          />
        </div>
        <div className="interviewBranchPanelFoot">
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={() => canJump && onJumpToStep?.(toText(context?.firstStepId))}
            disabled={!canJump}
          >
            Перейти к шагу в Matrix
          </button>
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={() => canJump && onOpenDiagram?.(toText(context?.firstStepId))}
            disabled={!canJump}
          >
            Открыть в Diagram
          </button>
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={async () => {
              if (!copyText) return;
              try {
                if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(copyText);
              } catch {
              }
            }}
            disabled={!copyText}
          >
            Копировать ссылку/ID
          </button>
        </div>
      </aside>
    </div>
  );
}

