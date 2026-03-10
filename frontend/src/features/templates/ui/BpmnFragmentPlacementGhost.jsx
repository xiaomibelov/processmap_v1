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
  return (
    <div className="pointer-events-none absolute inset-0 z-[8]" data-testid="bpmn-fragment-placement-layer">
      <div
        className="pointer-events-none absolute rounded-md border border-accent/80 bg-accentSoft/25 shadow-[0_0_0_1px_rgba(99,102,241,0.35)]"
        data-testid="bpmn-fragment-ghost"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
        }}
      />
      <div
        className="pointer-events-none absolute rounded bg-panel/95 px-2 py-1 text-[11px] text-fg shadow"
        style={{
          left: `${left}px`,
          top: `${Math.max(0, top - 24)}px`,
        }}
      >
        {String(data.title || "BPMN fragment")} · click to place · Esc to cancel
      </div>
    </div>
  );
}

