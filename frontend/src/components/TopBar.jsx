export default function TopBar({
  sessionId,
  sessions,
  backendStatus,
  onRefreshSessions,
  onNewBackendSession,
  onOpenSession,
}) {
  const items = Array.isArray(sessions) ? sessions : [];
  const statusLabel =
    backendStatus === "ok"
      ? "API: ok"
      : backendStatus === "fail"
        ? "API: fail"
        : "API: …";

  return (
    <div className="topbar">
      <div className="brand">
        <span className="dot" />
        <span>Food Process Copilot</span>
      </div>

      <div className="spacer" />

      <div className="small" style={{ color: "rgba(255,255,255,0.85)", fontWeight: 800 }}>
        {statusLabel}
      </div>

      <div style={{ width: 12 }} />

      <div className="small" style={{ color: "rgba(255,255,255,0.85)", fontWeight: 800 }}>
        Session: <span style={{ color: "#fff" }}>{sessionId || "—"}</span>
      </div>

      <div style={{ width: 12 }} />

      <select
        className="input"
        style={{ height: 34, minWidth: 260 }}
        value={sessionId || ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onOpenSession(v);
        }}
      >
        <option value="">— открыть сессию —</option>
        {items.map((s) => (
          <option key={s.session_id} value={s.session_id}>
            {s.title ? `${s.title} · ${s.session_id}` : s.session_id}
          </option>
        ))}
      </select>

      <div style={{ width: 8 }} />

      <button className="btn" onClick={onRefreshSessions} title="Обновить список">
        ↻
      </button>

      <div style={{ width: 8 }} />

      <button className="primaryBtn" style={{ height: 34 }} onClick={onNewBackendSession}>
        + New (API)
      </button>
    </div>
  );
}
