import { ProductActionsRegistryContent } from "./ProductActionsRegistryPanel.jsx";

export default function ProductActionsRegistry({
  scope = "workspace",
  workspaceId = "",
  projectId = "",
  projectTitle = "",
  sessionId = "",
  sessionTitle = "",
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
        onScopeChange={onScopeChange}
        onOpenProject={onOpenProject}
        onOpenSession={onOpenSession}
        onClose={onClose}
      />
    </main>
  );
}
