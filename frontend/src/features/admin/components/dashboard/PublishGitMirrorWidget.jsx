import { getPublishGitMirrorMeta } from "../../../../shared/publishGitMirrorStatus";
import ChartCard from "../common/ChartCard";
import KeyValueGrid from "../common/KeyValueGrid";
import { formatTs, toInt, toText } from "../../utils/adminFormat";

function toMirrorHealthLabel(raw) {
  const value = toText(raw).toLowerCase();
  if (value === "valid") return "valid";
  if (value === "invalid") return "invalid";
  return "unknown";
}

export default function PublishGitMirrorWidget({
  payload = {},
}) {
  const latestMeta = getPublishGitMirrorMeta(toText(payload.latest_result_state || "not_attempted"));
  const latestVersionNumber = Math.max(0, toInt(payload.latest_result_version_number, 0));
  const latestSessionId = toText(payload.latest_result_session_id);
  const latestError = toText(payload.latest_result_error);
  const latestResultLabel = (
    latestVersionNumber > 0
      ? `${latestMeta.label} · v${String(latestVersionNumber)}`
      : latestMeta.label
  );
  const latestHintParts = [];
  if (latestSessionId) latestHintParts.push(`Session ${latestSessionId}`);
  if (latestError) latestHintParts.push(`Error: ${latestError}`);
  const mirrorEnabled = payload.org_mirror_enabled === true;
  const mirrorHealth = toMirrorHealthLabel(payload.org_mirror_health_status);
  const mirrorConfigLabel = mirrorEnabled ? "Enabled" : "Disabled";
  const mirrorConfigHint = mirrorEnabled
    ? `Health: ${mirrorHealth}`
    : "Mirror disabled at organization level";

  return (
    <ChartCard
      title="Publish / Git Mirror"
      subtitle="Operational visibility for publish-only Git mirror"
      eyebrow="Publish"
    >
      <KeyValueGrid
        items={[
          { label: "Published BPMN versions", value: String(toInt(payload.published_bpmn_versions, 0)) },
          { label: "Mirrored to Git", value: String(toInt(payload.mirrored_to_git, 0)) },
          { label: "Mirror pending", value: String(toInt(payload.pending, 0)) },
          { label: "Mirror failed", value: String(toInt(payload.failed, 0)) },
          { label: "Latest mirror result", value: latestResultLabel, hint: latestHintParts.join(" · ") || "—" },
          { label: "Latest mirror attempt", value: formatTs(payload.latest_attempt_at) },
          { label: "Org mirror config", value: mirrorConfigLabel, hint: mirrorConfigHint },
        ]}
        columnsClassName="md:grid-cols-2 xl:grid-cols-2"
      />
    </ChartCard>
  );
}
