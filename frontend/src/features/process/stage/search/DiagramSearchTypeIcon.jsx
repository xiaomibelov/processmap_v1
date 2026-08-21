import { resolveTypeIconKind } from "./diagramSearchInlineModel.js";

const TYPE_META = {
  task: { label: "T", tone: "#3B82F6" },
  gateway: { label: "G", tone: "#F97316" },
  subprocess: { label: "S", tone: "#22C55E" },
  event: { label: "E", tone: "#A855F7" },
  flow: { label: "F", tone: "#9CA3AF" },
  other: { label: "•", tone: "#9CA3AF" },
};

export default function DiagramSearchTypeIcon({ type = "", className = "diagramSearchInlineItemIcon" }) {
  const kind = resolveTypeIconKind(type);
  const meta = TYPE_META[kind] || TYPE_META.other;
  return (
    <span
      className={className}
      title={kind}
      style={{
        backgroundColor: meta.tone,
        color: "#ffffff",
      }}
    >
      {meta.label}
    </span>
  );
}
