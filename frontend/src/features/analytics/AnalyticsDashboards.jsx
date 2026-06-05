import SessionAnalyticsDashboard from "./SessionAnalyticsDashboard.jsx";
import ProjectAnalyticsDashboard from "./ProjectAnalyticsDashboard.jsx";
import WorkspaceAnalyticsDashboard from "./WorkspaceAnalyticsDashboard.jsx";

export default function AnalyticsDashboards({
  workspaceId = "",
  projectId = "",
  sessionId = "",
  projectTitle = "",
  sessionTitle = "",
  onClose = null,
  onOpenProductActionsRegistry = null,
  onOpenPropertiesRegistry = null,
}) {
  return (
    <div data-testid="analytics-dashboards">
      {sessionId ? (
        <SessionAnalyticsDashboard
          sessionId={sessionId}
          sessionTitle={sessionTitle}
          workspaceId={workspaceId}
        />
      ) : projectId ? (
        <ProjectAnalyticsDashboard
          projectId={projectId}
          projectTitle={projectTitle}
          workspaceId={workspaceId}
        />
      ) : (
        <WorkspaceAnalyticsDashboard workspaceId={workspaceId} />
      )}
    </div>
  );
}
