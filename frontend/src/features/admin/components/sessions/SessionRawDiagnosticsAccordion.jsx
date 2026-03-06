import SectionCard from "../common/SectionCard";

export default function SessionRawDiagnosticsAccordion({
  payload = {},
}) {
  return (
    <SectionCard title="Raw Diagnostics" subtitle="Untouched payload for incident forensics" eyebrow="Raw">
      <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-900">Expand raw diagnostics payload</summary>
        <pre className="mt-3 max-h-[52vh] overflow-auto rounded-2xl bg-slate-950 p-3 text-[11px] text-slate-200">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </SectionCard>
  );
}

