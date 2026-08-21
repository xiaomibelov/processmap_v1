import SectionCard from "../common/SectionCard";
import { asArray } from "../../utils/adminFormat";

export default function SessionDrawioWarningsPanel({
  items = [],
}) {
  const rows = asArray(items);
  return (
    <SectionCard title="Draw.io Warnings" subtitle="Overlay warnings for BPMN-first debugging" eyebrow="Overlay">
      <div className="space-y-2">
        {rows.length ? rows.map((row, idx) => (
          <div key={`drawio_${idx}`} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {typeof row === "object" ? JSON.stringify(row) : String(row)}
          </div>
        )) : <div className="text-sm text-slate-500">No draw.io warnings.</div>}
      </div>
    </SectionCard>
  );
}

