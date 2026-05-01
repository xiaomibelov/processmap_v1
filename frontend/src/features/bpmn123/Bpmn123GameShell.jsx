import "./bpmn123.css";

import { getBpmn123Level } from "./bpmn123LevelModel";

export default function Bpmn123GameShell({ levelId }) {
  const level = getBpmn123Level(levelId);

  return (
    <main className="bpmn123-root" data-testid="bpmn123-root">
      <section className="bpmn123-shell" aria-label="BPMN 123 game shell">
        <header className="bpmn123-topbar" data-testid="bpmn123-topbar">
          <div className="bpmn123-brand-block">
            <span className="bpmn123-brand">BPMN 123</span>
            <span className="bpmn123-tier">{level.tier}</span>
          </div>
          <div className="bpmn123-level-heading">
            <h1>{level.title}</h1>
            <p>{level.targetProcess}</p>
          </div>
          <div className="bpmn123-progress-pill" aria-label="Прогресс уровня">
            <span>Прогресс</span>
            <strong>{level.progressLabel}</strong>
          </div>
        </header>

        <div className="bpmn123-main-grid">
          <aside className="bpmn123-panel bpmn123-story-panel" data-testid="bpmn123-left-panel">
            <p className="bpmn123-panel-kicker">{level.storyTitle}</p>
            <h2>Заявка клиента</h2>
            <p>{level.story}</p>
            <div className="bpmn123-mentor-note">
              <span>Наставник</span>
              <p>{level.mentorMessage}</p>
            </div>
          </aside>

          <section className="bpmn123-canvas-placeholder" data-testid="bpmn123-canvas-placeholder">
            <div className="bpmn123-canvas-frame">
              <span className="bpmn123-canvas-label">Canvas placeholder</span>
              <h2>BPMN canvas появится здесь</h2>
              <p>В следующем контуре подключим безопасный canvas wrapper.</p>
            </div>
          </section>

          <aside className="bpmn123-panel bpmn123-objectives-panel" data-testid="bpmn123-right-panel">
            <p className="bpmn123-panel-kicker">Цели уровня</p>
            <h2>Собери первый процесс</h2>
            <ul className="bpmn123-objective-list">
              {level.objectives.map((objective) => (
                <li key={objective}>
                  <span aria-hidden="true" />
                  <p>{objective}</p>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <footer className="bpmn123-bottom-panel" data-testid="bpmn123-bottom-progress">
          <div>
            <p className="bpmn123-panel-kicker">Навигатор прогресса уровня</p>
            <strong>Шаг 0 из 6</strong>
          </div>
          <div className="bpmn123-progress-track" aria-hidden="true">
            <span />
          </div>
        </footer>
      </section>
    </main>
  );
}
