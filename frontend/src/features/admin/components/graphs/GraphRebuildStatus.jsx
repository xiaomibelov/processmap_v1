import { useMemo } from "react";

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "success") return "text-emerald-600";
  if (s === "failed" || s === "timeout") return "text-rose-600";
  if (s === "running" || s === "pending") return "text-amber-600";
  return "text-slate-500";
}

export default function GraphRebuildStatus({ jobId, status, log = [], error = "" }) {
  const lastLines = useMemo(() => log.slice(-50), [log]);
  const statusText = String(status || "unknown");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Job:</span>
        <span className="font-mono text-slate-700">{jobId || "—"}</span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-500">Статус:</span>
        <span className={`font-semibold ${statusTone(status)}`}>{statusText}</span>
      </div>
      {error ? <div className="text-xs text-rose-600">{error}</div> : null}
      <div className="rounded-lg border border-slate-200 bg-slate-950 p-2 overflow-auto" style={{ maxHeight: 240 }}>
        {lastLines.length === 0 ? (
          <div className="text-xs text-slate-500">Лог пуст</div>
        ) : (
          <pre className="text-[11px] leading-4 font-mono text-slate-300 whitespace-pre-wrap">
            {lastLines.join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}
