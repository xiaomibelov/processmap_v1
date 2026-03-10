import { formatHHMMFromSeconds, toArray, toText } from "../utils";
import NestedDecision from "./NestedDecision";

function stepTimeLabel(nodeId, stepMetaByNodeId = {}) {
  const meta = stepMetaByNodeId[toText(nodeId)] || {};
  const workSec = Math.max(0, Number(meta?.workSec || 0));
  const waitSec = Math.max(0, Number(meta?.waitSec || 0));
  if (workSec <= 0 && waitSec <= 0) return "—";
  return `work ${formatHHMMFromSeconds(workSec)} • wait ${formatHHMMFromSeconds(waitSec)}`;
}

export default function BranchStepsList({
  nodes = [],
  stepMetaByNodeId = {},
  onOpenBranchSteps,
  depth = 0,
  pathPrefix = "",
}) {
  return (
    <div className="interviewBranchStepsList" style={{ "--branch-depth": depth }}>
      {toArray(nodes).map((node, idx) => {
        const kind = toText(node?.kind).toLowerCase();
        const key = `${pathPrefix}_${kind}_${idx + 1}_${toText(node?.nodeId || node?.targetNodeId || node?.title)}`;
        if (kind === "decision" || kind === "parallel") {
          return (
            <NestedDecision
              key={key}
              node={node}
              pathKey={`${pathPrefix}.${idx + 1}`}
              stepMetaByNodeId={stepMetaByNodeId}
              onOpenBranchSteps={onOpenBranchSteps}
            />
          );
        }
        if (kind === "continue") {
          return (
            <div key={key} className="interviewBranchStepRow continue">
              <span className="badge ok">Дальше</span>
              <span>{toText(node?.targetTitle || node?.targetNodeId || "—")}</span>
            </div>
          );
        }
        if (kind === "loop") {
          return (
            <div key={key} className="interviewBranchStepRow loop">
              <span className="badge warn">Петля</span>
              <span>{toText(node?.targetTitle || node?.targetNodeId || "—")}</span>
            </div>
          );
        }
        if (kind === "terminal") {
          return (
            <div key={key} className="interviewBranchStepRow fail">
              <span className="badge err">Сбой</span>
              <span>{toText(node?.title || "Завершение")}</span>
            </div>
          );
        }
        return (
          <div key={key} className="interviewBranchStepRow step">
            <span className="interviewBranchStepOrder">#{toText(node?.graphNo || "—")}</span>
            <span className="interviewBranchStepTitle">{toText(node?.title || node?.nodeId || "—")}</span>
            <span className="muted small">{stepTimeLabel(node?.nodeId, stepMetaByNodeId)}</span>
          </div>
        );
      })}
    </div>
  );
}

