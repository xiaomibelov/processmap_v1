import SectionCard from "../common/SectionCard";
import ActiveFiltersSummary from "./ActiveFiltersSummary";
import { toText } from "../../adminUtils";

export default function AdminFiltersBar({
  title = "Filters",
  subtitle = "",
  activeFilters = [],
  children = null,
}) {
  return (
    <SectionCard title={title} subtitle={subtitle} eyebrow="Controls">
      <div className="space-y-3">
        {children}
        {activeFilters.length ? <ActiveFiltersSummary items={activeFilters} /> : null}
        {(!children && !toText(subtitle)) ? <div className="text-sm text-slate-500">No filters configured.</div> : null}
      </div>
    </SectionCard>
  );
}

