export default function TransitionsBlock({ collapsed, toggleBlock, transitionView, patchTransitionWhen }) {
  return (
    <div className="interviewBlock">
      <div className="interviewBlockHead">
        <div>
          <div className="interviewBlockTitle">B2. Ветки BPMN (условия переходов)</div>
        </div>
        <button type="button" className="secondaryBtn smallBtn interviewCollapseBtn" onClick={() => toggleBlock("transitions")}>
          {collapsed ? "Показать" : "Скрыть"}
        </button>
      </div>
      {!collapsed ? (
        <div className="interviewTableWrap">
          <table className="interviewTable">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Условие перехода (`sequenceFlow`)</th>
              </tr>
            </thead>
            <tbody>
              {!transitionView.length ? (
                <tr>
                  <td colSpan={3} className="muted interviewEmpty">В текущей BPMN-схеме нет переходов для редактирования.</td>
                </tr>
              ) : (
                transitionView.map((tr) => (
                  <tr key={tr.id || tr.key}>
                    <td>
                      <div>{tr.from_title}</div>
                      <div className="muted small">{tr.from_node_id}{tr.from_lane ? ` · ${tr.from_lane}` : ""}</div>
                    </td>
                    <td>
                      <div>{tr.to_title}</div>
                      <div className="muted small">{tr.to_node_id}{tr.to_lane ? ` · ${tr.to_lane}` : ""}</div>
                    </td>
                    <td>
                      <input
                        className="input"
                        value={tr.when}
                        onChange={(e) => patchTransitionWhen(tr.from_node_id, tr.to_node_id, e.target.value)}
                        placeholder="Напр.: Да / Нет, температура < 90, контроль не пройден"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
