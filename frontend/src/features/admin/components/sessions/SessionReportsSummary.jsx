import KeyValueGrid from "../common/KeyValueGrid";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { toInt } from "../../utils/adminFormat";

export default function SessionReportsSummary({
  reportsDoc = {},
}) {
  return (
    <SectionCard title="Reports / Doc" subtitle="Current reporting outputs and readiness" eyebrow="Outputs">
      <KeyValueGrid
        items={[
          { label: "Reports Versions", value: String(toInt(reportsDoc?.reports_versions, 0)) },
          { label: "Doc Version", value: String(toInt(reportsDoc?.doc_version, 0)) },
          { label: "Doc Ready", value: <StatusPill status={reportsDoc?.doc_ready ? "ready" : "missing"} tone={reportsDoc?.doc_ready ? "ok" : "warn"} /> },
        ]}
        columnsClassName="md:grid-cols-3"
      />
    </SectionCard>
  );
}

