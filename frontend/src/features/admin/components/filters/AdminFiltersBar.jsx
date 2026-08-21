import SectionCard from "../common/SectionCard";
import ActiveFiltersSummary from "./ActiveFiltersSummary";
import { toText } from "../../adminUtils";
import { ru } from "../../../../shared/i18n/ru";

export default function AdminFiltersBar({
  title = "Фильтры",
  subtitle = "",
  activeFilters = [],
  children = null,
}) {
  return (
    <SectionCard title={title} subtitle={subtitle} eyebrow="Управление">
      <div className="space-y-3">
        {children}
        {activeFilters.length ? <ActiveFiltersSummary items={activeFilters} /> : null}
        {(!children && !toText(subtitle)) ? <div className="text-sm text-slate-500">{ru.admin.orgsPage.filtersEmpty}</div> : null}
      </div>
    </SectionCard>
  );
}
