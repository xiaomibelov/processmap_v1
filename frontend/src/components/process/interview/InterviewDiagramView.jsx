import { toArray, toText } from "./utils";

function normalizeTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

function tierClass(tierRaw) {
  const tier = normalizeTier(tierRaw);
  return `tier tier-${tier.toLowerCase()}`;
}

export default function InterviewDiagramView({
  dodSnapshot,
  selectedStepIds,
  onSelectStep,
}) {
  const nodes = toArray(dodSnapshot?.bpmn_nodes);
  const steps = toArray(dodSnapshot?.interview_steps);
  const selected = new Set(toArray(selectedStepIds).map((id) => toText(id)).filter(Boolean));
  const stepByNode = {};
  steps.forEach((step) => {
    const nodeId = toText(step?.bpmn_ref);
    const stepId = toText(step?.step_id);
    if (!nodeId || !stepId || stepByNode[nodeId]) return;
    stepByNode[nodeId] = step;
  });
  const linkGroups = toArray(dodSnapshot?.link_groups);

  return (
    <div className="interviewDiagramMode" data-testid="interview-diagram-mode">
      <div className="interviewDiagramModeHead">
        <div className="interviewDiagramModeTitle">Граф анализа</div>
        <div className="muted small">
          BPMN nodes: {nodes.length} · link groups: {linkGroups.length}
        </div>
      </div>

      {linkGroups.length ? (
        <div className="interviewDiagramLinkGroups">
          {linkGroups.map((group) => (
            <span key={toText(group?.link_key)} className={`interviewDiagramLinkChip ${toText(group?.integrity)}`}>
              <span className="interviewDiagramLinkDot" style={{ background: `#${toText(group?.color_key) || "8f9bb3"}` }} />
              {toText(group?.link_key)}
              <span className="muted small">{toText(group?.integrity)}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="interviewDiagramNodeList">
        {nodes.map((node) => {
          const nodeId = toText(node?.bpmn_id);
          const linkedStep = stepByNode[nodeId] || null;
          const linkedStepId = toText(linkedStep?.step_id);
          const isSelected = !!(linkedStepId && selected.has(linkedStepId));
          return (
            <button
              key={nodeId}
              type="button"
              className={`interviewDiagramNodeRow ${isSelected ? "isSelected" : ""}`}
              onClick={() => {
                if (linkedStepId) onSelectStep?.(linkedStepId, true);
              }}
              title={linkedStepId ? `Шаг ${toText(linkedStep?.step_no)} · ${toText(linkedStep?.title)}` : "Шаг не привязан"}
            >
              <span className="interviewDiagramNodeMain">
                <span className="interviewDiagramNodeName">{toText(node?.name) || nodeId}</span>
                <span className={tierClass(node?.tier)}>{normalizeTier(node?.tier)}</span>
              </span>
              <span className="interviewDiagramNodeMeta">
                <span className="muted small">{toText(node?.type) || "—"}</span>
                <span className="badge">AI {Number(node?.ai_count || 0)}</span>
                <span className="badge">Notes {Number(node?.notes_count || 0)}</span>
                {linkedStepId ? <span className="badge ok">Step {toText(linkedStep?.step_no)}</span> : <span className="badge warn">unbound</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
