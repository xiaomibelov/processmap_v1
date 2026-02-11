import CopilotOverlay from "./process/CopilotOverlay";

export default function ProcessStage({ mode }) {
  const isInterview = mode === "interview";

  return (
    <div className="panel processPanel">
      <div className="processHead">
        <div className="title">
          Процесс <span className="muted" style={{ fontWeight: 600 }}>(Workflow)</span>
        </div>
        <div className="spacer" />
        <button className="btn" disabled>−</button>
        <button className="btn" disabled>+</button>
        <button className="btn" disabled>Fit</button>
      </div>

      <div className="processCanvas">
        <div className="lanesBg" />

        <div className="laneLabel" style={{ top: 78 }}>Горячий цех</div>
        <div className="laneLabel" style={{ top: 166 }}>Упаковка</div>
        <div className="laneLabel" style={{ top: 254 }}>Контроль качества</div>
        <div className="laneLabel" style={{ top: 342 }}>Логистика</div>

        {!isInterview ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
            <div className="card" style={{ maxWidth: 560 }}>
              <div style={{ fontWeight: 950, marginBottom: 6 }}>Actors-first</div>
              <div className="small muted">
                Заполни роли и start_role. После этого включится режим интервью и активируется док заметок.
              </div>
            </div>
          </div>
        ) : null}

        {isInterview ? (
          <>
            <div className="mockCircle mockStart" style={{ position: "absolute", left: 56, top: 78 }}>●</div>
            <div className="small muted" style={{ position: "absolute", left: 58, top: 128, fontWeight: 800 }}>Старт</div>

            <div className="mockNode" style={{ left: 140, top: 66, width: 170 }}>
              Подготовка<br />ингредиентов
            </div>

            <div className="arrow" style={{ left: 108, top: 101, width: 30 }} />
            <div className="arrow" style={{ left: 224, top: 146, width: 2, height: 34, background: "rgba(16,24,40,0.55)" }} />

            <div className="mockNode" style={{ left: 160, top: 150, width: 160 }}>
              Обжарка<br />на сковороде
            </div>

            <div className="arrow" style={{ left: 322, top: 182, width: 52 }} />

            <div className="mockNode" style={{ left: 380, top: 150, width: 150 }}>
              Довести<br />до готовности
            </div>

            <div className="arrow" style={{ left: 450, top: 206, width: 2, height: 52, background: "rgba(16,24,40,0.55)" }} />

            <div className="mockNode" style={{ left: 360, top: 244, width: 160 }}>
              Упаковка<br />блюда
            </div>

            <div className="arrow" style={{ left: 522, top: 276, width: 52 }} />

            <div className="mockNode" style={{ left: 580, top: 244, width: 170 }}>
              Проверка<br />качества
            </div>

            <div className="arrow" style={{ left: 752, top: 276, width: 52 }} />

            <div className="mockNode" style={{ left: 810, top: 244, width: 42, textAlign: "center" }}>
              ◇
            </div>

            <div className="arrow" style={{ left: 828, top: 286, width: 2, height: 78, background: "rgba(16,24,40,0.55)" }} />

            <div className="mockNode" style={{ left: 760, top: 342, width: 170 }}>
              Отправка<br />на доставку
            </div>

            <div className="arrow" style={{ left: 838, top: 396, width: 2, height: 56, background: "rgba(16,24,40,0.55)" }} />

            <div className="mockCircle mockEnd" style={{ position: "absolute", left: 816, top: 450 }}>●</div>
            <div className="small muted" style={{ position: "absolute", left: 808, top: 500, fontWeight: 800 }}>Финиш</div>

            <CopilotOverlay />
          </>
        ) : null}
      </div>
    </div>
  );
}
