import KeyValueGrid from "../common/KeyValueGrid";
import SectionCard from "../common/SectionCard";

export default function SessionAutoPassVisibilityPanel({
  variantDebug = {},
}) {
  return (
    <SectionCard title="Variant Visibility Debug" subtitle="Listing/strict-filter semantics for diagnostics" eyebrow="Variant">
      <KeyValueGrid
        items={[
          { label: "Final Node", value: variantDebug?.finalNode || "-" },
          { label: "Main EndEvent Reached", value: variantDebug?.mainEndReached ? "Yes" : "No" },
          { label: "Strict Filter Passed", value: variantDebug?.strictFilterPassed ? "Yes" : "No" },
          { label: "Was Listed", value: variantDebug?.wasListed ? "Yes" : "No" },
          { label: "Should Be Listed", value: variantDebug?.shouldBeListed ? "Yes" : "No" },
          { label: "Final Visible Status", value: variantDebug?.finalVisibleStatus || "hidden" },
          { label: "Reason", value: variantDebug?.reason || "-" },
          { label: "Counted Steps", value: String(variantDebug?.countedSteps || 0) },
          { label: "Subprocess Count", value: String(variantDebug?.subprocessCount || 0) },
          { label: "Teleport Count", value: String(variantDebug?.teleportCount || 0) },
          { label: "Duration", value: variantDebug?.totalDuration || "-" },
        ]}
        columnsClassName="md:grid-cols-2 xl:grid-cols-2"
      />
    </SectionCard>
  );
}

