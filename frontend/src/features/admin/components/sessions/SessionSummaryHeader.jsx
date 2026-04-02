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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusPill status={item?.status} />
          <StatusPill status={mirrorMeta.label} tone={mirrorMeta.adminTone} label="Git mirror" />
          {mirrorSnapshot.versionNumber > 0 ? (
            <StatusPill status={`v${String(mirrorSnapshot.versionNumber)}`} tone="default" />
          ) : null}
          <StatusPill status={`Updated ${formatTs(item?.updated_at)}`} tone="default" />
          <StatusPill status={`Owner ${toText(item?.owner_id || "—")}`} tone="default" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="secondaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onBack?.()}>
            Back to Sessions
          </button>
          <button type="button" className="secondaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.org))}>
            Org
          </button>
          <button type="button" className="secondaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.project))}>
            Project
          </button>
          <button type="button" className="primaryBtn h-9 min-h-0 rounded-2xl px-3 py-0 text-xs" onClick={() => onNavigate?.(toText(links?.editor))}>
            Editor
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
