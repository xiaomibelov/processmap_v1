export default function ActorsCard({ roles, startRole }) {
  const list = Array.isArray(roles) ? roles : [];
  const sr = typeof startRole === "string" ? startRole : "";

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>Акторы</div>

      {list.length === 0 ? (
        <div className="small muted">Пока нет ролей.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {list.map((r) => (
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
        <span style={{ fontWeight: 900 }}>{sr || "—"}</span>
      </div>
    </div>
  );
}
