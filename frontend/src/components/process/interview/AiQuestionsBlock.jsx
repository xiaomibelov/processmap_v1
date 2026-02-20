import { AI_STATUS, statusClass, typeLabel } from "./utils";

export default function AiQuestionsBlock({
  collapsed,
  toggleBlock,
  aiRows,
  patchQuestionStatus,
}) {
  return (
    <div className="interviewBlock">
      <div className="interviewBlockHead">
        <div>
          <div className="interviewBlockTitle">AI-вопросы (по шагам)</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            Кнопка AI в строке шага запрашивает вопросы у LLM для конкретного шага. Статусы можно менять вручную.
          </div>
        </div>
        <button type="button" className="secondaryBtn smallBtn interviewCollapseBtn" onClick={() => toggleBlock("ai")}>
          {collapsed ? "Показать" : "Скрыть"}
        </button>
      </div>

      {!collapsed ? (
        <div className="interviewTableWrap">
          <table className="interviewTable">
            <thead>
              <tr>
                <th>Шаг №</th>
                <th>Тип</th>
                <th>Шаг</th>
                <th>Вопрос</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {!aiRows.length ? (
                <tr>
                  <td colSpan={5} className="muted interviewEmpty">Вопросов пока нет.</td>
                </tr>
              ) : (
                aiRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.seq}</td>
                    <td>{typeLabel(row.type)}</td>
                    <td>{row.stepTitle || "—"}</td>
                    <td>{row.text}</td>
                    <td>
                      <select className={"select interviewStatus " + statusClass(row.status)} value={row.status} onChange={(e) => patchQuestionStatus(row.stepId, row.id, e.target.value)}>
                        {AI_STATUS.map((s) => (
                          <option value={s} key={s}>{s}</option>
                        ))}
                      </select>
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
