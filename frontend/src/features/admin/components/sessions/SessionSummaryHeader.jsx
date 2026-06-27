import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { formatTs, toText } from "../../utils/adminFormat";
import { extractPublishGitMirrorSnapshot, getPublishGitMirrorMeta } from "../../../../shared/publishGitMirrorStatus";

export default function SessionSummaryHeader({
  item = {},
  links = {},
  onBack,
  onNavigate,
}) {
  const mirrorSnapshot = extractPublishGitMirrorSnapshot(item);
  const mirrorMeta = getPublishGitMirrorMeta(mirrorSnapshot.state);
  return (
    <SectionCard eyebrow="Session" title={toText(item?.title || item?.session_id)} subtitle={`SID ${toText(item?.session_id)} · Org ${toText(item?.org_name || item?.org_id)} · Project ${toText(item?.project_name || item?.project_id)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <StatusPill status={item?.status} compact />
          <StatusPill status={mirrorMeta.label} tone={mirrorMeta.adminTone} label="Git mirror" compact />
          {mirrorSnapshot.versionNumber > 0 ? (
            <StatusPill status={`v${String(mirrorSnapshot.versionNumber)}`} tone="default" compact />
          ) : null}
          <StatusPill status={`Updated ${formatTs(item?.updated_at)}`} tone="default" compact />
          <StatusPill status={`Owner ${toText(item?.owner_id || "—")}`} tone="default" compact />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="secondaryBtn h-7 min-h-0 rounded-lg px-2.5 py-0 text-xs" onClick={() => onBack?.()}>
            Back to Sessions
          </button>
          <button type="button" className="secondaryBtn h-7 min-h-0 rounded-lg px-2.5 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.org))}>
            Org
          </button>
          <button type="button" className="secondaryBtn h-7 min-h-0 rounded-lg px-2.5 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.project))}>
            Project
          </button>
          <button type="button" className="primaryBtn h-7 min-h-0 rounded-lg px-2.5 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.editor))}>
            Editor
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
