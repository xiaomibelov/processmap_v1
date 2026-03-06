import SectionCard from "../common/SectionCard";
import { asArray, toText } from "../../utils/adminFormat";

export default function SessionGatewayChoicesPanel({
  choices = [],
}) {
  const rows = asArray(choices);
  return (
    <SectionCard title="Gateway Choices" subtitle="Gateway selections in selected variant" eyebrow="Choices">
      <div className="space-y-2">
        {rows.length ? rows.map((choice, idx) => (
          <div key={`${toText(choice?.gateway_id)}_${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            {toText(choice?.gateway_id)} -> {toText(choice?.label || choice?.flow_id)}
          </div>
        )) : <div className="text-sm text-slate-500">No gateway choices.</div>}
      </div>
    </SectionCard>
  );
}

