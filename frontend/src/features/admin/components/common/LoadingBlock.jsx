import { ru } from "../../../../shared/i18n/ru";

export default function LoadingBlock({
  label = ru.admin.runtime.loadingSection,
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500 shadow-sm">
      {label}
    </div>
  );
}
