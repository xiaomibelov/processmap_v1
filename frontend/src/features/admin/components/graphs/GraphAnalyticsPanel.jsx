import KpiCard from "../common/KpiCard.jsx";
import SectionCard from "../common/SectionCard.jsx";
import EmptyState from "../common/EmptyState.jsx";

function MiniTable({ columns = [], rows = [], emptyText = "Нет данных" }) {
  if (!rows.length) return <div className="text-xs text-slate-500 py-2">{emptyText}</div>;
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-100">
            {columns.map((col) => (
              <th key={col.key} className="py-1.5 pr-2 font-medium">{col.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-50 last:border-0">
              {columns.map((col) => (
                <td key={col.key} className="py-1.5 pr-2 text-slate-700">
                  {row[col.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GraphAnalyticsPanel({ analytics, title, subtitle }) {
  if (!analytics) {
    return (
      <SectionCard title={title} subtitle={subtitle}>
        <EmptyState title="Аналитика недоступна" description="Сначала запустите пересборку графа." />
      </SectionCard>
    );
  }

  const layerRows = (analytics.layer_distribution || []).map((layer) => ({
    layer: (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: layer.color }} />
        <span>{layer.label}</span>
      </span>
    ),
    count: layer.node_count,
    percent: `${layer.percent}%`,
  }));

  const hubRows = (analytics.top_hubs || []).map((hub) => ({
    node: hub.label,
    layer: hub.layer,
    degree: hub.degree,
  }));

  const communityRows = (analytics.largest_communities || []).map((c) => ({
    community: c.label,
    layer: c.layer,
    size: c.size,
  }));

  const gapRows = (analytics.layer_gaps || []).map((gap) => ({
    pair: `${gap.source_layer} ↔ ${gap.target_layer}`,
    edges: gap.edge_count,
    note: gap.note,
  }));

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard title="Всего нод" value={analytics.total_nodes ?? "—"} />
        <KpiCard title="Рёбер" value={analytics.total_edges ?? "—"} />
        <KpiCard title="Community-нод" value={analytics.community_nodes ?? "—"} />
        <KpiCard title="Изолировано" value={analytics.isolated_nodes ?? "—"} />
        <KpiCard title="% unclassified" value={analytics.unclassified_percent != null ? `${analytics.unclassified_percent}%` : "—"} />
        <KpiCard title="Cross-community рёбер" value={analytics.cross_community_edges ?? "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard eyebrow="Распределение" title="По слоям" className="bg-slate-50">
          <MiniTable
            columns={[{ key: "layer", title: "Слой" }, { key: "count", title: "Ноды" }, { key: "percent", title: "%" }]}
            rows={layerRows}
          />
        </SectionCard>

        <SectionCard eyebrow="Hubs" title="Топ по degree" className="bg-slate-50">
          <MiniTable
            columns={[{ key: "node", title: "Нода" }, { key: "layer", title: "Слой" }, { key: "degree", title: "Degree" }]}
            rows={hubRows}
          />
        </SectionCard>

        <SectionCard eyebrow="Communities" title="Крупнейшие" className="bg-slate-50">
          <MiniTable
            columns={[{ key: "community", title: "Community" }, { key: "layer", title: "Слой" }, { key: "size", title: "Размер" }]}
            rows={communityRows}
          />
        </SectionCard>

        <SectionCard eyebrow="Разрывы" title="Между слоями" className="bg-slate-50">
          <MiniTable
            columns={[{ key: "pair", title: "Пара слоёв" }, { key: "edges", title: "Рёбра" }, { key: "note", title: "Примечание" }]}
            rows={gapRows}
          />
        </SectionCard>
      </div>
    </SectionCard>
  );
}
