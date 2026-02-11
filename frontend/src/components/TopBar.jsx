export default function TopBar({ sessionId, onNewSession, onOpenSession }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brandBadge" />
        <div>Food Process Copilot</div>
      </div>

      <div className="spacer" />

      <div style={{ fontWeight: 800, opacity: 0.95 }}>
        Session: <span style={{ fontWeight: 950 }}>{sessionId || "—"}</span>
      </div>

      <button className="iconBtn" title="Help" disabled>?</button>
      <button className="iconBtn" title="Notes" disabled>💬</button>
      <button className="iconBtn" title="User" disabled>👤</button>

      <button className="iconBtn" title="Open session (later)" onClick={onOpenSession} disabled>⤓</button>
      <button className="iconBtn" title="New local session" onClick={onNewSession}>＋</button>
    </div>
  );
}
