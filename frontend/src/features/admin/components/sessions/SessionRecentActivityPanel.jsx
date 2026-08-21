import KeyValueGrid from "../common/KeyValueGrid";
import SectionCard from "../common/SectionCard";
import { formatTs, toInt, toText } from "../../utils/adminFormat";

export default function SessionRecentActivityPanel({
  item = {},
  autopass = {},
  audit = {},
}) {
  return (
    <SectionCard title="Recent Activity" subtitle="Timeline summary from latest payload state" eyebrow="Activity">
      <KeyValueGrid
        items={[
          { label: "Last Update", value: formatTs(item?.updated_at) },
          { label: "AutoPass Run", value: toText(autopass?.last_run || "-") },
          { label: "Run ID", value: toText(autopass?.run_id || "-") },
          { label: "Audit Rows", value: String(toInt(audit?.count, 0)) },
        ]}
      />
    </SectionCard>
  );
}

