export default function BranchesToolbar({
  collapsed,
  transitionCount,
  conditionalCount,
  onOpenAdd,
  onToggleCollapsed,
}) {
  return (
    <div className="interviewBranchesHead sticky top-0 z-20">
      <div>
        <div className="interviewBlockTitle">B2. Ветки BPMN</div>
        <div className="interviewBoundsSubTitle">Условия переходов (`sequenceFlow`)</div>
      </div>
      <div className="interviewBlockTools">
        <button
          type="button"
          className="primaryBtn smallBtn"
          onClick={onOpenAdd}
          data-testid="interview-transition-open-modal"
        >
          + Добавить переход
        </button>
        <button
          type="button"
          className="secondaryBtn smallBtn interviewCollapseBtn"
          onClick={onToggleCollapsed}
        >
          {collapsed ? "Развернуть" : "Скрыть"}
        </button>
      </div>
      {collapsed ? (
        <div className="interviewBranchesCollapsedLine">
          Переходов: {transitionCount} · С условием: {conditionalCount}
        </div>
      ) : null}
    </div>
  );
}
