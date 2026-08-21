import { toText } from "../../adminUtils";
import { ru } from "../../../../shared/i18n/ru";

export default function EmptyState({
  title = ru.admin.emptyState.title,
  description = "",
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center">
      <div className="text-sm font-medium text-slate-700">{toText(title)}</div>
      <div className="mt-1 text-xs text-slate-500">{toText(description) || ru.admin.emptyState.description}</div>
    </div>
  );
}
