import KeyValueGrid from "../common/KeyValueGrid";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { asArray, asObject, toText } from "../../utils/adminFormat";

export default function SessionBpmnIntegrityPanel({
  autopass = {},
  rawAutoPass = {},
}) {
  const pathsIssues = [
    ...asArray(rawAutoPass?.warnings).map((row) => toText(row?.message || row?.code)),
    ...Object.entries(asObject(autopass?.filtered_reason)).map(([key, value]) => `${key}: ${value}`),
  ].filter(Boolean);
  return (
    <SectionCard title="Eligibility / Issues" subtitle="EndEvent and AutoPass eligibility posture" eyebrow="Validation">
      <KeyValueGrid
        items={[
          { label: "AutoPass Status", value: <StatusPill status={autopass?.status || "idle"} /> },
          { label: "End-Event Validation", value: <StatusPill status={autopass?.end_event_validation?.ok ? "ok" : "failed"} tone={autopass?.end_event_validation?.ok ? "ok" : "danger"} /> },
          { label: "Failed Reason", value: toText(autopass?.end_event_validation?.failed_reason || "-") },
          { label: "Warnings", value: String(asArray(rawAutoPass?.warnings).length) },
        ]}
      />
      <div className="mt-4 space-y-2">
        {pathsIssues.length ? pathsIssues.map((issue, idx) => (
          <div key={`${issue}_${idx}`} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {issue}
          </div>
        )) : <div className="text-sm text-slate-500">No explicit issues in payload.</div>}
      </div>
    </SectionCard>
  );
}

