export default function CopilotOverlay({ open, onClose, selectedEl }) {
  if (!open) return null;

  return (
    <div className="copilotPanel">
      <div className="copilotHead">
        <div style={{ fontWeight: 900 }}>AI Copilot</div>
        <button className="iconBtn" onClick={onClose} title="Закрыть">✕</button>
      </div>

      <div className="copilotBody">
        {!selectedEl ? (
          <div className="small muted">Выбери узел на схеме, чтобы получить вопросы по нему.</div>
        ) : (
          <div className="card node" data-status="info" data-selected="true">
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Узел: {selectedEl.id}</div>
            <div className="small muted" style={{ marginBottom: 10 }}>Тип: {selectedEl.type}</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span className="pill">Критерии “готово”</span>
              <span className="pill">Параметры/допуски</span>
              <span className="pill" data-priority="high">Что при отклонении?</span>
              <span className="pill">Что фиксируем?</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
