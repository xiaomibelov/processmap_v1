import { useMemo } from "react";
import TopRightCtaGroup from "../../components/nav/TopRightCtaGroup";

function projectIdFrom(p) {
  return (p && (p.id || p.project_id || p.slug)) || "";
}

function projectTitleFrom(p) {
  return (p && (p.title || p.name || p.id || p.project_id || p.slug)) || "—";
}

function sessionIdFrom(s) {
  return (s && (s.session_id || s.id)) || "";
}

function sessionTitleFrom(s) {
  const id = sessionIdFrom(s);
  return (s && (s.title || s.name)) || id || "—";
}

export default function TopBar({
  backendStatus,
  backendHint,
  projects,
  projectId,
  onProjectChange,
  sessionId,
  sessions,
  onOpen,
  onRefresh,
  onNewProject,
  onNewLocal,
  onNewBackend,
}) {
  const statusLine = useMemo(() => {
    if (backendStatus === "ok") return "API OK";
    if (backendStatus === "fail") return "API FAIL";
    return "API …";
  }, [backendStatus]);

  const hasProjects = (projects || []).length > 0;
  const canCreateApiSession = Boolean(projectId);

  return (
    <div className="topBar">
      <div className="topBarInner">
        <div className="topBarBrand">
          <div className="brand">ProcessMap</div>
          <div className="small">{statusLine}</div>
          {backendHint ? <div className="small muted">{backendHint}</div> : null}
        </div>

        <div className="spacer" />

        <div className="topBarControls">
          <select
            className="input topbarSelectSm"
            value={projectId || ""}
            onChange={(e) => onProjectChange?.(e.target.value || "")}
            title="Проект"
          >
            <option value="">— проект —</option>
            {(projects || []).map((p, idx) => {
              const id = projectIdFrom(p);
              return (
                <option key={`${id || "p"}_${idx}`} value={id}>
                  {projectTitleFrom(p)}
                </option>
              );
            })}
          </select>

          <select
            className="input topbarSelectLg"
            value={sessionId || ""}
            onChange={(e) => onOpen?.(e.target.value)}
            title="Сессия"
          >
            <option value="">— выбрать сессию —</option>
            {(sessions || []).map((s, idx) => {
              const id = sessionIdFrom(s);
              return (
                <option key={`${id || "s"}_${idx}`} value={id}>
                  {sessionTitleFrom(s)}
                </option>
              );
            })}
          </select>

          <button className="secondaryBtn" onClick={onRefresh} title="Обновить список проектов/сессий">
            Обновить
          </button>
          <button className="secondaryBtn" onClick={onNewLocal} title="Создать локальный черновик">
            Новая (Local)
          </button>
          <TopRightCtaGroup
            onCreateProject={onNewProject}
            onCreateSession={onNewBackend}
            createProjectLabel="Новый проект"
            createSessionLabel="Создать сессию"
            createSessionDisabled={!canCreateApiSession}
            createSessionTitle={canCreateApiSession ? "Создать сессию в проекте" : "Сначала выбери или создай проект"}
            compact
          />
        </div>
      </div>
    </div>
  );
}
