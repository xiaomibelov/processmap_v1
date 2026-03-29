function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function BpmnFragmentPlacementGhost({ ghost, active = false }) {
  const data = asObject(ghost);
  if (!active || !data) return null;
  const width = Number(data.width || 0);
  const height = Number(data.height || 0);
  if (!(width > 0) || !(height > 0)) return null;
  const left = Number(data.left || 0);
  const top = Number(data.top || 0);
  const anchorLeft = Number(data.anchorLeft || (left + (width / 2)));
  const anchorTop = Number(data.anchorTop || (top + (height / 2)));
  const nodes = Math.max(0, Number(data.nodes || 0));
  const edges = Math.max(0, Number(data.edges || 0));
  const title = String(data.title || "BPMN fragment");
  const mode = String(data.mode || "").toLowerCase();
  const phase = String(data.phase || "").toLowerCase();
  const immediateMode = mode === "immediate";
  const statusText = immediateMode
    ? (phase === "after_insert" ? "Фрагмент вставлен" : "Точка авто-вставки шаблона")
    : "Точка вставки · клик для вставки · Esc отмена";
  const borderColor = immediateMode && phase === "after_insert"
    ? "2px solid rgba(16, 185, 129, 0.95)"
    : "2px dashed rgba(79, 107, 255, 0.95)";
  const fillColor = immediateMode && phase === "after_insert"
    ? "rgba(16, 185, 129, 0.16)"
    : "rgba(79, 107, 255, 0.14)";
  const anchorBg = immediateMode && phase === "after_insert"
    ? "rgba(16, 185, 129, 0.94)"
    : "rgba(79, 107, 255, 0.94)";
  return (
    <div className="pointer-events-none absolute inset-0 z-[24]" data-testid="bpmn-fragment-placement-layer">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "rgba(15, 23, 42, 0.08)" }}
      />
      <div
        className="pointer-events-none absolute top-0 bottom-0 w-px"
        style={{
          left: `${anchorLeft}px`,
          background: "linear-gradient(to bottom, rgba(79,107,255,0), rgba(79,107,255,0.45), rgba(79,107,255,0))",
        }}
      />
      <div
        className="pointer-events-none absolute left-0 right-0 h-px"
        style={{
          top: `${anchorTop}px`,
          background: "linear-gradient(to right, rgba(79,107,255,0), rgba(79,107,255,0.45), rgba(79,107,255,0))",
        }}
      />
      <div
        className="pointer-events-none absolute rounded-lg"
        data-testid="bpmn-fragment-ghost"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
          border: borderColor,
          background: fillColor,
          boxShadow: "0 0 0 1px rgba(79, 107, 255, 0.35), 0 10px 28px rgba(15, 23, 42, 0.22)",
        }}
      />
      <div
        className="pointer-events-none absolute rounded-md px-2 py-1 text-[11px] text-white shadow"
        style={{
          left: `${Math.max(8, left)}px`,
          top: `${Math.max(8, top - 30)}px`,
          background: "rgba(15, 23, 42, 0.9)",
        }}
      >
        {title} · {nodes} узл. · {edges} flow
      </div>
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          left: `${anchorLeft}px`,
          top: `${anchorTop}px`,
          width: "18px",
          height: "18px",
          marginLeft: "-9px",
          marginTop: "-9px",
          border: "2px solid rgba(79, 107, 255, 0.95)",
          background: "rgba(255, 255, 255, 0.92)",
          boxShadow: "0 0 0 5px rgba(79, 107, 255, 0.2)",
        }}
      />
      <div
        className="pointer-events-none absolute rounded-md px-2 py-1 text-[11px] text-white shadow"
        style={{
          left: `${Math.max(8, Math.round(anchorLeft + 14))}px`,
          top: `${Math.max(8, Math.round(anchorTop + 14))}px`,
          background: anchorBg,
        }}
      >
        {statusText}
      </div>
    </div>
  );
}
