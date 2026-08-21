import KeyValueGrid from "../common/KeyValueGrid";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { formatTs, toInt, toText } from "../../utils/adminFormat";

export default function SessionIntegrityPanel({
  item = {},
  warnings = {},
}) {
  return (
    <SectionCard title="Integrity Checks" subtitle="Primary consistency checks for the session entity" eyebrow="Checks">
      <KeyValueGrid
        items={[
          { label: "Session Status", value: <StatusPill status={item?.status} /> },
          { label: "Updated", value: formatTs(item?.updated_at) },
          { label: "Created", value: formatTs(item?.created_at) },
          { label: "Project", value: toText(item?.project_name || item?.project_id || "-") },
          { label: "Warnings", value: String(toInt(warnings?.warnings_count, 0)) },
          { label: "Errors", value: String(toInt(warnings?.errors_count, 0)) },
        ]}
      />
    </SectionCard>
  );
}

