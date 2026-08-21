import KeyValueGrid from "../common/KeyValueGrid";
import SectionCard from "../common/SectionCard";
import { asArray } from "../../utils/adminFormat";

export default function SessionDiagnosticsSummary({
  diagnostics = {},
}) {
  return (
    <SectionCard title="Diagnostics Summary" subtitle="Save, retry, overlay, and template signals" eyebrow="Diagnostics">
      <KeyValueGrid
        items={[
          { label: "Save / Retry", value: String(asArray(diagnostics?.save_retry_history).length) },
          { label: "Lock Busy", value: String(asArray(diagnostics?.lock_busy_history).length) },
          { label: "Draw.io Warnings", value: String(asArray(diagnostics?.drawio_warnings).length) },
          { label: "Template Warnings", value: String(asArray(diagnostics?.template_apply_warnings).length) },
        ]}
        columnsClassName="md:grid-cols-2 xl:grid-cols-4"
      />
    </SectionCard>
  );
}

