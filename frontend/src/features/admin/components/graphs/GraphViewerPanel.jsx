import { useMemo } from "react";
import { apiRoutes } from "../../../../lib/apiRoutes.js";
import SectionCard from "../common/SectionCard.jsx";
import EmptyState from "../common/EmptyState.jsx";
import { toText } from "../../adminUtils.js";

export default function GraphViewerPanel({ currentSnapshot, title, subtitle }) {
  const src = useMemo(() => {
    return currentSnapshot?.id ? apiRoutes.admin.graphsSnapshotCurrentHtml() : "";
  }, [currentSnapshot]);

  const commitSha = toText(currentSnapshot?.commit_sha);
  const commitMessage = toText(currentSnapshot?.commit_message);

  return (
    <SectionCard title={title} subtitle={subtitle}>
      {!src ? (
        <EmptyState title="Нет текущего снапшота" description="Сначала запустите пересборку графа." />
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {commitSha ? (
              <span className="font-mono">{commitSha.slice(0, 8)}</span>
            ) : null}
            {commitMessage ? <span className="truncate max-w-md">{commitMessage}</span> : null}
          </div>
          <div className="rounded-lg border border-slate-200 overflow-hidden" style={{ height: "60vh", minHeight: 420 }}>
            <iframe
              title="graphify-viewer"
              src={src}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}
    </SectionCard>
  );
}
