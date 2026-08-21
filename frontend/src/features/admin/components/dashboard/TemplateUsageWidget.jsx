import ChartCard from "../common/ChartCard";
import KeyValueGrid from "../common/KeyValueGrid";

export default function TemplateUsageWidget({
  payload = {},
}) {
  return (
    <ChartCard title="Template Usage" subtitle="Top template telemetry available in admin dashboard payload" eyebrow="Templates">
      <KeyValueGrid
        items={[
          { label: "Total Templates", value: String(payload.total_templates ?? 0), hint: "Personal + org scope" },
          { label: "Active Templates", value: String(payload.active_templates ?? 0), hint: "Templates used at least once" },
          { label: "Cross-Session Packs", value: String(payload.cross_session_templates ?? 0), hint: "Portable fragment-oriented packs" },
          { label: "Broken Anchors", value: String(payload.broken_anchor_templates ?? 0), hint: "Selection packs with anchor issues" },
        ]}
        columnsClassName="md:grid-cols-2 xl:grid-cols-4"
      />
    </ChartCard>
  );
}
