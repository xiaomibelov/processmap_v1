export default function NoSession({
  backendHint,
  projectId,
  onNewProject,
  onCreateApiSession,
  onCreateLocal,
}) {
  const hasProject = !!projectId;

  return (
    <div className="panel">
      <div className="panelHead">Сессия</div>
      <div className="panelBody">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Backend ↔ Frontend</div>
          <div className="small muted">
            Для BPMN/notes нужен реальный session_id (не local_*).
            В твоей модели мы создаём <b>project session</b> через /api/projects/&lt;id&gt;/sessions?mode=...
          </div>
          {backendHint ? (
            <div className="small muted" style={{ marginTop: 8 }}>
              {backendHint}
            </div>
          ) : null}
        </div>

        <button className="secondaryBtn" style={{ width: "100%", marginBottom: 10 }} onClick={onNewProject}>
          Новый проект (API)
        </button>

        <button
          className="primaryBtn"
          style={{ width: "100%", marginBottom: 10 }}
          onClick={() => onCreateApiSession?.()}
          disabled={!hasProject}
          title={hasProject ? "Создать API-сессию" : "Сначала выбери или создай проект в TopBar"}
        >
          Создать сессию (API)
        </button>

        <button className="btn" style={{ width: "100%" }} onClick={onCreateLocal}>
          Local draft (без API)
        </button>

        <div className="small muted" style={{ marginTop: 10 }}>
          Local draft остаётся как fallback, но “соединить бэк и фронт” делаем через API-сессии проекта.
        </div>
      </div>
    </div>
  );
}
