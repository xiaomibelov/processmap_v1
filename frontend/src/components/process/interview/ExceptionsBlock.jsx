import { AnalysisSection } from "../../../features/process/analysis/ui/index.js";
import styles from "../../../features/process/analysis/ProcessAnalysis.module.css";

export default function ExceptionsBlock({
  collapsed,
  toggleBlock,
  exceptions,
  addException,
  patchException,
  deleteException,
}) {
  const list = Array.isArray(exceptions) ? exceptions : [];

  return (
    <AnalysisSection
      title="D. Исключения (привязка к шагам)"
      subtitle="Альтернативные ветки процесса при сбоях и отклонениях"
      actions={
        <button type="button" className="primaryBtn smallBtn" onClick={addException} data-testid="exceptions-add-btn">
          + Добавить исключение
        </button>
      }
      badge={list.length >= 10 ? "10+ исключений" : `Исключения: ${list.length}`}
      collapsible
      collapsed={collapsed}
      onToggleCollapse={() => toggleBlock("exceptions")}
      data-testid="exceptions-block"
    >
      <div className={styles.analysisTableWrap}>
        <table className={styles.analysisTable}>
          <caption className="sr-only">Таблица исключений процесса</caption>
          <thead className={styles.analysisTableHead}>
            <tr>
              <th scope="col">На шаге №</th>
              <th scope="col">Ситуация</th>
              <th scope="col">Триггер (как заметили)</th>
              <th scope="col">Действия (ветка)</th>
              <th scope="col">* минут добавляет</th>
              <th scope="col">Кто решает</th>
              <th scope="col">Действия</th>
            </tr>
          </thead>
          <tbody className={styles.analysisTableBody}>
            {!list.length ? (
              <tr>
                <td colSpan={7} className={styles.analysisTableEmpty}>
                  <div>Исключений пока нет.</div>
                  <button
                    type="button"
                    className="primaryBtn smallBtn"
                    onClick={addException}
                    data-testid="exceptions-empty-add-btn"
                    style={{ marginTop: 12 }}
                  >
                    + Добавить исключение
                  </button>
                </td>
              </tr>
            ) : (
              list.map((x) => (
                <tr key={x.id} className={styles.analysisTableRow}>
                  <td className={styles.analysisTableCell}>
                    <input
                      className={styles.analysisTableInput}
                      type="number"
                      min="1"
                      value={x.step_seq}
                      onChange={(e) => patchException(x.id, "step_seq", e.target.value)}
                    />
                  </td>
                  <td className={styles.analysisTableCell}>
                    <input
                      className={styles.analysisTableInput}
                      value={x.situation}
                      onChange={(e) => patchException(x.id, "situation", e.target.value)}
                      placeholder="Что случилось"
                    />
                  </td>
                  <td className={styles.analysisTableCell}>
                    <input
                      className={styles.analysisTableInput}
                      value={x.trigger}
                      onChange={(e) => patchException(x.id, "trigger", e.target.value)}
                      placeholder="Как заметили"
                    />
                  </td>
                  <td className={styles.analysisTableCell}>
                    <input
                      className={styles.analysisTableInput}
                      value={x.actions}
                      onChange={(e) => patchException(x.id, "actions", e.target.value)}
                      placeholder="Что делаем"
                    />
                  </td>
                  <td className={styles.analysisTableCell}>
                    <input
                      className={styles.analysisTableInput}
                      type="number"
                      min="0"
                      value={x.add_min}
                      onChange={(e) => patchException(x.id, "add_min", e.target.value)}
                    />
                  </td>
                  <td className={styles.analysisTableCell}>
                    <input
                      className={styles.analysisTableInput}
                      value={x.owner}
                      onChange={(e) => patchException(x.id, "owner", e.target.value)}
                      placeholder="Ответственный"
                    />
                  </td>
                  <td className={styles.analysisTableCell}>
                    <button type="button" className="dangerBtn smallBtn" onClick={() => deleteException(x.id)}>
                      удалить
                    </button>
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
