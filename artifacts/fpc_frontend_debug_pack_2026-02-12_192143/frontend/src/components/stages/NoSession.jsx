export default function NoSession({ onCreateBackend, onCreateLocal, backendHint }) {
  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>
      <div className="panelBody">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Backend ↔ Frontend</div>
          <div className="small muted">
            Чтобы BPMN грузился с бэка, нужен реальный session_id (не local_*).
            Создай сессию через API — и фронт начнёт ходить в /api/sessions/&lt;id&gt;/bpmn и /notes.
          </div>
          {backendHint ? (
            <div className="small muted" style={{ marginTop: 8 }}>
              {backendHint}
            </div>
          ) : null}
        </div>

        <button className="primaryBtn" style={{ width: "100%", marginBottom: 10 }} onClick={onCreateBackend}>
          Создать сессию (API)
        </button>

        <button className="btn" style={{ width: "100%" }} onClick={onCreateLocal}>
          Local draft (без API)
        </button>

        <div className="small muted" style={{ marginTop: 10 }}>
          Local draft остаётся как fallback, но для “соединить бэк и фронт” используем API-сессию.
        </div>
      </div>
    </div>
  );
}
