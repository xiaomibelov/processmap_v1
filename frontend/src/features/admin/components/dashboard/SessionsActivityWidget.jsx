import ChartCard from "../common/ChartCard";
import { asArray, toInt, toText } from "../../utils/adminFormat";

export default function SessionsActivityWidget({
  points = [],
}) {
  const rows = asArray(points);
  const max = Math.max(1, ...rows.map((row) => toInt(row?.count, 0)));
  return (
    <ChartCard title="Sessions Activity" subtitle="Daily update volume across current org context" eyebrow="Volume">
      <div className="grid grid-cols-10 gap-2">
        {rows.slice(-10).map((row) => {
          const count = toInt(row?.count, 0);
          const height = Math.max(12, Math.round((count / max) * 96));
          return (
            <div key={toText(row?.date)} className="flex flex-col items-center gap-2">
              <div className="text-[10px] text-slate-500">{count}</div>
              <div className="flex w-full items-end rounded-2xl bg-slate-100 px-1 pb-1">
                <div className="w-full rounded-xl bg-emerald-500/80" style={{ height: `${height}px` }} />
              </div>
              <div className="text-[10px] text-slate-400">{toText(row?.date).slice(5)}</div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

