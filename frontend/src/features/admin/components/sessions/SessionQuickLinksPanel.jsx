import SectionCard from "../common/SectionCard";
import { toText } from "../../utils/adminFormat";

export default function SessionQuickLinksPanel({
  links = {},
  onNavigate,
}) {
  return (
    <SectionCard title="Quick Links" subtitle="Jump to related org/project/editor context" eyebrow="Navigation">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="secondaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.org))}>
          Open Org
        </button>
        <button type="button" className="secondaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.project))}>
          Open Project
        </button>
        <button type="button" className="primaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.editor))}>
          Open Editor
        </button>
      </div>
    </SectionCard>
  );
}

