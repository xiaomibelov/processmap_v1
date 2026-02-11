export default function NoSession({ onCreateLocal }) {
  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>
      <div className="panelBody">
        <div style={{ fontWeight: 800, marginBottom: 6 }}>NoSession</div>
        <div className="small muted" style={{ marginBottom: 12 }}>
          Сначала нужно создать или открыть сессию. На этом шаге делаем минимум: создать локальную сессию (draft в localStorage).
        </div>

        <button className="primaryBtn" onClick={onCreateLocal}>
          Создать сессию
        </button>

        <div className="small muted" style={{ marginTop: 10 }}>
          Дальше подключим API список/выбор: GET/POST /api/sessions.
        </div>
      </div>
    </div>
  );
}
