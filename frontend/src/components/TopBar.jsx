import React from "react";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

function getSessionId(s) {
  if (!s) return "";
  if (typeof s.session_id === "string") return s.session_id;
  if (typeof s.id === "string") return s.id;
  return "";
}

function getSessionTitle(s) {
  if (!s) return "";
  if (typeof s.title === "string" && s.title.trim()) return s.title.trim();
  const id = getSessionId(s);
  return id ? id : "Без названия";
}

export default function TopBar(props) {
  const apiOk = Boolean(
    (props.api && props.api.ok) ||
      (props.apiStatus && props.apiStatus.ok) ||
      props.apiOk === true
  );

  const sessionId = typeof props.sessionId === "string" ? props.sessionId : "";

  const sessions = Array.isArray(props.sessions)
    ? props.sessions
    : Array.isArray(props.sessionList)
    ? props.sessionList
    : [];

  const onOpenSession =
    props.onOpenSession ||
    props.onSelectSession ||
    props.onOpen ||
    (() => {});

  const onRefreshSessions = props.onRefreshSessions || props.onRefresh || (() => {});

  const onNewApiSession =
    props.onNewApiSession || props.onCreateApiSession || props.onNewApi || (() => {});

  const isLocal = isLocalSessionId(sessionId);

  return (
    <div className="topBar">
      <div className="topBarInner">
        <div className="brand">
          <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Food Process Copilot</div>
        </div>

        <div
          className={"pill " + (apiOk ? "pillOk" : "pillFail")}
          title={
            apiOk
              ? "API доступно (cookie-сессия; ключ не нужен)"
              : "API недоступно. Проверь backend: http://127.0.0.1:8011/health"
          }
        >
          API: {apiOk ? "ок" : "нет"}
        </div>

        <div className="small" style={{ marginLeft: 6 }}>
          <span className="muted">Сессия:</span>{" "}
          <span style={{ fontWeight: 900 }}>{sessionId || "—"}</span>
        </div>

        <select
          className={"input topbarSelect " + (isLocal ? "attentionRing" : "")}
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            onOpenSession(id);
          }}
          title="Открыть сессию с сервера"
        >
          <option value="">— открыть сессию —</option>
          {sessions.map((s) => {
            const id = getSessionId(s);
            if (!id) return null;
            const label = getSessionTitle(s);
            return (
              <option key={id} value={id}>
                {label}
              </option>
            );
          })}
        </select>

        <button className="ghostBtn topbarIconBtn" onClick={onRefreshSessions} title="Обновить список сессий">
          ↻
        </button>

        <button
          className={"primaryBtn topbarNewBtn " + (isLocal ? "attention" : "")}
          onClick={onNewApiSession}
          title="Создать новую серверную сессию (для реального workflow)"
        >
          Новая (API)
        </button>
      </div>
    </div>
  );
}
