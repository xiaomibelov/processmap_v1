import SectionCard from "./SectionCard";
import { toText } from "../../adminUtils";
import { ru } from "../../../../shared/i18n/ru";

export default function EmptyState({
  title = ru.admin.emptyState.title,
  description = "",
}) {
  return (
    <SectionCard title={title} subtitle={description}>
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        {toText(description) || ru.admin.emptyState.description}
      </div>
    </SectionCard>
  );
}
