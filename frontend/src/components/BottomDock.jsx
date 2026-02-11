export default function BottomDock({ locked }) {
  return (
    <div className="bottomDock">
      <div className="dockHead">
        <div style={{ fontWeight: 800, color: "#0f172a" }}>Сообщения / Заметки</div>
        <div className="spacer" />
        <button className="btn" disabled>Expand</button>
      </div>

      <div className="dockBody">
        <div className="small muted">
          В этом доке будет чат/заметки интервью. На текущем шаге input намеренно блокируется, пока не пройден Actors-first.
        </div>

        <div className="inputRow">
          <textarea
            className="textarea"
            placeholder={locked ? "Сначала заполните Actors (roles + start_role)..." : "Введите сообщение..."}
            disabled={locked}
          />
          <button className="btn" disabled={locked}>Отправить</button>
        </div>
      </div>
    </div>
  );
}
