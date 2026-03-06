import SectionCard from "./SectionCard";
import { toText } from "../../adminUtils";

export default function EmptyState({
  title = "No data",
  description = "",
}) {
  return (
    <SectionCard title={title} subtitle={description}>
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        {toText(description) || "This panel has no records for the current filters."}
      </div>
    </SectionCard>
  );
}

