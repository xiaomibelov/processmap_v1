export default function ExceptionsBlock({
  collapsed,
  toggleBlock,
  exceptions,
  addException,
  patchException,
  deleteException,
}) {
  return (
    <div className="interviewBlock">
      <div className="interviewBlockHead">
        <div className="interviewBlockTitle">D. Исключения (привязка к шагам)</div>
        <div className="interviewBlockTools">
          <span className={"badge " + (exceptions.length >= 10 ? "ok" : "warn")}>Исключения: {exceptions.length} / 10+</span>
          <button type="button" className="secondaryBtn smallBtn" onClick={addException}>+ Добавить исключение</button>
          <button type="button" className="secondaryBtn smallBtn interviewCollapseBtn" onClick={() => toggleBlock("exceptions")}>
            {collapsed ? "Показать" : "Скрыть"}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="interviewTableWrap">
          <table className="interviewTable">
            <thead>
              <tr>
                <th>На шаге №</th>
                <th>Ситуация</th>
                <th>Триггер (как заметили)</th>
                <th>Действия (ветка)</th>
                <th>* минут добавляет</th>
                <th>Кто решает</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {!exceptions.length ? (
                <tr>
                  <td colSpan={7} className="muted interviewEmpty">Добавьте исключения процесса.</td>
                </tr>
              ) : (
                exceptions.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <input className="input" type="number" min="1" value={x.step_seq} onChange={(e) => patchException(x.id, "step_seq", e.target.value)} />
                    </td>
                    <td>
                      <input className="input" value={x.situation} onChange={(e) => patchException(x.id, "situation", e.target.value)} placeholder="Что случилось" />
                    </td>
                    <td>
                      <input className="input" value={x.trigger} onChange={(e) => patchException(x.id, "trigger", e.target.value)} placeholder="Как заметили" />
                    </td>
                    <td>
                      <input className="input" value={x.actions} onChange={(e) => patchException(x.id, "actions", e.target.value)} placeholder="Что делаем" />
                    </td>
                    <td>
                      <input className="input" type="number" min="0" value={x.add_min} onChange={(e) => patchException(x.id, "add_min", e.target.value)} />
                    </td>
                    <td>
                      <input className="input" value={x.owner} onChange={(e) => patchException(x.id, "owner", e.target.value)} placeholder="Ответственный" />
                    </td>
                    <td>
                      <button type="button" className="dangerBtn smallBtn" onClick={() => deleteException(x.id)}>удалить</button>
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
