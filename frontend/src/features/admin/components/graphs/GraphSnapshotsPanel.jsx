import SectionCard from "../common/SectionCard.jsx";
import EmptyState from "../common/EmptyState.jsx";
import { formatTs } from "../../adminUtils.js";

export default function GraphSnapshotsPanel({ snapshots = [], title, subtitle }) {
  const rows = snapshots.slice(0, 10);

  return (
    <SectionCard title={title} subtitle={subtitle}>
      {rows.length === 0 ? (
        <EmptyState title="История снапшотов пуста" description="После пересборки здесь появятся последние версии." />
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-1.5 pr-2 font-medium">ID</th>
                <th className="py-1.5 pr-2 font-medium">Создан</th>
                <th className="py-1.5 pr-2 font-medium">Commit</th>
                <th className="py-1.5 pr-2 font-medium">Текущий</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((snap) => (
                <tr key={snap.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5 pr-2 font-mono text-slate-600">{snap.id}</td>
                  <td className="py-1.5 pr-2 text-slate-600">{formatTs(snap.created_at)}</td>
                  <td className="py-1.5 pr-2 text-slate-600" title={snap.commit_message}>
                    <span className="font-mono">{(snap.commit_sha || "").slice(0, 8)}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    {snap.is_current ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Текущий
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
