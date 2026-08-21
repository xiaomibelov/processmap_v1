export default function ActorsCard({ roles, startRole, onEditActors }) {
  const hasRoles = Array.isArray(roles) && roles.length > 0;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="cardHeadRow">
        <div style={{ fontWeight: 900 }}>Акторы</div>

        {typeof onEditActors === "function" ? (
          <button className="secondaryBtn smallBtn" onClick={onEditActors} title="Редактировать акторов">
            Редактировать
          </button>
        ) : null}
      </div>

      {!hasRoles ? (
        <div className="small muted">Пока нет ролей.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {roles.map((r) => (
            <div key={r.role_id || r} className="small">
              <span style={{ fontWeight: 900 }}>{r.label || r}</span>{" "}
              <span className="muted">({r.role_id || r})</span>
            </div>
          ))}
        </div>
      )}

      <div className="hr" />

      <div className="small">
        <span className="muted">start_role:</span>{" "}
        <span style={{ fontWeight: 900 }}>{startRole || "—"}</span>
      </div>
    </div>
  );
}
