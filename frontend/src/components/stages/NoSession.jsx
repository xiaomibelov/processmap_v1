export default function NoSession({ onCreateLocal }) {
  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>
      <div className="panelBody">
        <div style={{ fontWeight: 900, marginBottom: 6 }}>NoSession</div>
        <div className="small muted" style={{ marginBottom: 12 }}>
          Сначала нужно создать/открыть сессию. На этом шаге делаем минимум:
          локальная сессия (draft в localStorage). API подключим следующим шагом.
        </div>

        <button className="primaryBtn" onClick={onCreateLocal}>
          Создать сессию
        </button>

        <div className="small muted" style={{ marginTop: 10 }}>
          План: GET/POST /api/sessions + селектор сессий в TopBar.
        </div>
      </div>
    </div>
  );
}
