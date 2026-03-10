import SectionCard from "../common/SectionCard";
import { asArray, toText } from "../../utils/adminFormat";

export default function SessionCountedStepsPanel({
  detailRows = [],
}) {
  const rows = asArray(detailRows);
  return (
    <SectionCard title="Counted Steps / Detail Rows" subtitle="Task, gateway, teleport, and end-event rows" eyebrow="Flow">
      <div className="space-y-2">
        {rows.length ? rows.map((row, idx) => (
          <div key={`${toText(row?.kind)}_${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <strong className="text-slate-950">{toText(row?.kind)}</strong>{" "}
            {toText(row?.name || row?.node_id || row?.label || row?.flow_id || `${row?.from || ""} -> ${row?.to || ""}`)}
          </div>
        )) : <div className="text-sm text-slate-500">No detail rows.</div>}
      </div>
    </SectionCard>
  );
}

