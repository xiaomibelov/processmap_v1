import SectionCard from "./SectionCard";
import { toText } from "../../adminUtils";
import { ru } from "../../../../shared/i18n/ru";

export default function ErrorState({
  title = ru.admin.runtime.dataErrorTitle,
  message = "",
}) {
  return (
    <SectionCard title={title}>
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
        {toText(message) || ru.common.errorServer}
      </div>
    </SectionCard>
  );
}
