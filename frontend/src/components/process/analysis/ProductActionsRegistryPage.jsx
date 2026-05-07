import { ProductActionsRegistryContent } from "./ProductActionsRegistryPanel.jsx";

export default function ProductActionsRegistryPage({
  scope = "workspace",
  workspaceId = "",
  projectId = "",
  projectTitle = "",
  sessionId = "",
  sessionTitle = "",
  interviewData = null,
  onScopeChange = null,
  onOpenProject = null,
  onOpenSession = null,
  onClose = null,
}) {
  return (
    <main className="productActionsRegistryPage" data-testid="product-actions-registry-page">
      <ProductActionsRegistryContent
        page
        showWorkspaceScope
        initialScope={scope}
        workspaceId={workspaceId}
        projectId={projectId}
        projectTitle={projectTitle}
        sessionId={sessionId}
        sessionTitle={sessionTitle}
        interviewData={interviewData}
        onScopeChange={onScopeChange}
        onOpenProject={onOpenProject}
        onOpenSession={onOpenSession}
        onClose={onClose}
      />
    </main>
  );
}
