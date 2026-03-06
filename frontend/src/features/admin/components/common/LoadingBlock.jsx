export default function LoadingBlock({
  label = "Loading admin data…",
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500 shadow-sm">
      {label}
    </div>
  );
}

