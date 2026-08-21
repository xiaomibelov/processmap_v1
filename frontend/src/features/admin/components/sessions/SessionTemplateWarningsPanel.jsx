import SectionCard from "../common/SectionCard";
import { asArray } from "../../utils/adminFormat";

export default function SessionTemplateWarningsPanel({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title="Template Warnings" subtitle="Template pack/apply diagnostics" eyebrow="Templates">
      <div className="space-y-2">
        {rows.length ? rows.map((row, idx) => (
          <div key={`tpl_${idx}`} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {typeof row === "object" ? JSON.stringify(row) : String(row)}
          </div>
        )) : <div className="text-sm text-slate-500">No template warnings.</div>}
      </div>
    </SectionCard>
  );
}
