export default function NotesPanel({ locked }) {
  return (
    <div className="panel">
      <div className="panelHead">Заметки с производства</div>

      <div className="panelBody">
        <div className="list">
          <div>
            <div className="listItemTitle">1. Подготовка ингредиентов</div>
            <ul className="bullets">
              <li>Нарезать овощи</li>
              <li>Взвесить мясо</li>
            </ul>
          </div>

          <div>
            <div className="listItemTitle">2. Готовка в горячем цехе</div>
            <ul className="bullets">
              <li>Обжарить на сковороде</li>
              <li>Довести до готовности</li>
            </ul>
          </div>

          <div>
            <div className="listItemTitle">3. Упаковка блюда</div>
            <ul className="bullets">
              <li>Упаковать в контейнер</li>
              <li>Герметично запечатать</li>
            </ul>
          </div>

          <div>
            <div className="listItemTitle">4. Контроль качества</div>
            <ul className="bullets">
              <li>Проверить температуру</li>
              <li>Визуальный осмотр</li>
            </ul>
          </div>

          <div>
            <div className="listItemTitle">5. Отправка на доставку</div>
          </div>
        </div>

        <div className="hr" />

        <button className="primaryBtn" disabled={locked}>
          Сгенерировать процесс
        </button>

        {locked ? (
          <div className="small muted" style={{ marginTop: 10 }}>
            Actors-first: сначала роли и start_role (на следующем шаге сделаем экран).
          </div>
        ) : null}
      </div>
    </div>
  );
}
