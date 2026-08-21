import KeyValueGrid from "../common/KeyValueGrid";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { toInt, toText } from "../../utils/adminFormat";

export default function SessionAutoPassSummary({
  autopass = {},
  rawAutoPass = {},
  selectedVariantId = "",
}) {
  return (
    <SectionCard title="AutoPass Run Summary" subtitle="Run-level status and semantics" eyebrow="Run">
      <KeyValueGrid
        items={[
          { label: "Run Status", value: <StatusPill status={autopass?.status || "idle"} /> },
          { label: "Run ID", value: toText(autopass?.run_id || "-") },
          { label: "Overwrite Of", value: toText(rawAutoPass?.overwrite_of || autopass?.overwrite_of || "-") },
          { label: "Overwrite Semantics", value: toText(autopass?.overwrite_semantics || "overwrite_on_start") },
          { label: "Done / Failed / Filtered", value: `${toInt(autopass?.done_failed_filtered?.total_variants_done, 0)} / ${toInt(autopass?.done_failed_filtered?.total_variants_failed, 0)} / ${toInt(autopass?.done_failed_filtered?.filtered_total, 0)}` },
          { label: "Selected Variant", value: toText(selectedVariantId || "-") },
        ]}
        columnsClassName="md:grid-cols-2 xl:grid-cols-2"
      />
    </SectionCard>
  );
}

