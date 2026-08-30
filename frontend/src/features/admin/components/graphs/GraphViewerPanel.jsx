import { useEffect, useMemo, useState } from "react";
import { apiRoutes } from "../../../../lib/apiRoutes.js";
import { apiRequest as request } from "../../../../lib/apiCore.js";
import SectionCard from "../common/SectionCard.jsx";
import EmptyState from "../common/EmptyState.jsx";
import { toText } from "../../adminUtils.js";

export default function GraphViewerPanel({ currentSnapshot, title, subtitle }) {
  const endpoint = useMemo(() => {
    return currentSnapshot?.id ? apiRoutes.admin.graphsSnapshotCurrentHtml() : "";
  }, [currentSnapshot]);

  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!endpoint) {
      setHtml("");
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    async function load() {
      const res = await request(endpoint, { method: "GET" });
      if (cancelled) return;
      setLoading(false);
      if (res.ok && typeof res.text === "string" && res.text.length > 0) {
        setHtml(res.text);
      } else if (res.ok) {
        setError("Получен пустой HTML");
      } else {
        setError(res.error || `Ошибка загрузки графа (${res.status})`);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const commitSha = toText(currentSnapshot?.commit_sha);
  const commitMessage = toText(currentSnapshot?.commit_message);

  return (
    <SectionCard title={title} subtitle={subtitle}>
      {!endpoint ? (
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
            {loading ? (
              <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
                Загрузка вьювера…
              </div>
            ) : error ? (
              <div className="w-full h-full flex items-center justify-center text-sm text-red-600 p-4">
                {error}
              </div>
            ) : (
              <iframe
                title="graphify-viewer"
                srcDoc={html}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
