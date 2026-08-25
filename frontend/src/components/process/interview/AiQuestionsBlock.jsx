import { AnalysisSection } from "../../../features/process/analysis/ui/index.js";
import styles from "../../../features/process/analysis/ProcessAnalysis.module.css";
import { AI_STATUS, statusClass, typeLabel } from "./utils";

export default function AiQuestionsBlock({
  collapsed,
  toggleBlock,
  aiRows,
  patchQuestionStatus,
}) {
  const rows = Array.isArray(aiRows) ? aiRows : [];

  return (
    <AnalysisSection
      title="AI-вопросы (по шагам)"
      subtitle="Кнопка AI в строке шага запрашивает вопросы у LLM для конкретного шага. Статусы можно менять вручную."
      collapsible
      collapsed={collapsed}
      onToggleCollapse={() => toggleBlock("ai")}
      data-testid="ai-questions-block"
    >
      <div className={styles.analysisTableWrap}>
        <table className={styles.analysisTable}>
          <caption className="sr-only">AI-вопросы по шагам процесса</caption>
          <thead className={styles.analysisTableHead}>
            <tr>
              <th scope="col">Шаг №</th>
              <th scope="col">Тип</th>
              <th scope="col">Шаг</th>
              <th scope="col">Вопрос</th>
              <th scope="col">Статус</th>
            </tr>
          </thead>
          <tbody className={styles.analysisTableBody}>
            {!rows.length ? (
              <tr>
                <td colSpan={5} className={styles.analysisTableEmpty}>
                  Вопросов пока нет.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={styles.analysisTableRow}>
                  <td className={styles.analysisTableCell}>{row.seq}</td>
                  <td className={styles.analysisTableCell}>{typeLabel(row.type)}</td>
                  <td className={styles.analysisTableCell}>{row.stepTitle || "—"}</td>
                  <td className={styles.analysisTableCell}>{row.text}</td>
                  <td className={styles.analysisTableCell}>
                    <select
                      className={`select interviewStatus ${statusClass(row.status)}`}
                      value={row.status}
                      onChange={(e) => patchQuestionStatus(row.stepId, row.id, e.target.value)}
                    >
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
    </AnalysisSection>
  );
}
