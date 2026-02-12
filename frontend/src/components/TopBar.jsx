import { useMemo } from "react";

export default function TopBar({ sessionId, sessions, backendStatus, backendHint, onRefresh, onNewLocal, onNewBackend, onOpen }) {
  const badge = useMemo(() => {
    if (backendStatus === "ok") return <span className="badge ok">API OK</span>;
    if (backendStatus === "fail") return <span className="badge err">API FAIL</span>;
    return <span className="badge">API …</span>;
  }, [backendStatus]);

  return (
    <div className="topbar">
      <div className="topLeft">
        <div className="brand">Food Process Copilot</div>
        {badge}
        {backendHint ? <div className="hint">{backendHint}</div> : null}
      </div>

      <div className="topRight">
        <select className="select" value={sessionId || ""} onChange={(e) => onOpen?.(e.target.value)}>
          <option value="">— выбрать сессию —</option>
          {(sessions || []).map((s) => {
            const id = s.session_id || s.id;
            const title = s.title || id;
            return <option key={id} value={id}>{title}</option>;
          })}
        </select>

        <button className="secondaryBtn" onClick={onRefresh} title="Обновить список сессий">Обновить</button>
        <button className="secondaryBtn" onClick={onNewLocal} title="Создать локальный черновик">Новая (Local)</button>
        <button className="primaryBtn smallBtn" onClick={onNewBackend} title="Создать backend-сессию">Новая (API)</button>
      </div>
    </div>
  );
}
