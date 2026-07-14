import { resolveTypeIconKind } from "./diagramSearchInlineModel.js";

export default function DiagramSearchTypeIcon({ type = "", className = "diagramSearchInlineItemIcon" }) {
  const kind = resolveTypeIconKind(type);
  const common = {
    "aria-hidden": "true",
    viewBox: "0 0 16 16",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  if (kind === "gateway") {
    return (
      <svg {...common}>
        <path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z" />
      </svg>
    );
  }
  if (kind === "subprocess") {
    return (
      <svg {...common}>
        <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
        <path d="M8 6v4M6 8h4" />
      </svg>
    );
  }
  if (kind === "event") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5" />
      </svg>
    );
  }
  if (kind === "flow") {
    return (
      <svg {...common}>
        <path d="M2.5 8h8" />
        <path d="M10.5 4.5L14 8l-3.5 3.5" />
      </svg>
    );
  }
  if (kind === "task") {
    return (
      <svg {...common}>
        <rect x="2.5" y="3.5" width="11" height="9" rx="2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="4" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" />
    </svg>
  );
}
