import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeExplainability(raw) {
  const value = raw && typeof raw === "object" ? raw : null;
  if (!value) return null;
  const normalized = {
    code: String(value.code || "").trim(),
    label: String(value.label || "").trim(),
    description: String(value.description || "").trim(),
    whatChecked: String(value.whatChecked || "").trim(),
    howCalculated: String(value.howCalculated || "").trim(),
    source: String(value.source || "").trim(),
    impact: String(value.impact || "").trim(),
    severity: String(value.severity || "").trim() || null,
    isBlocking: typeof value.isBlocking === "boolean" ? value.isBlocking : null,
    isCanonical: typeof value.isCanonical === "boolean" ? value.isCanonical : null,
    kind: String(value.kind || "").trim() || null,
  };
  if (!normalized.label && !normalized.whatChecked && !normalized.howCalculated && !normalized.source && !normalized.impact) {
    return null;
  }
  return normalized;
}

export default function DodExplainTooltip({
  explainability,
  label = "Пояснение",
  className = "",
}) {
  const normalized = useMemo(() => normalizeExplainability(explainability), [explainability]);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: -9999, left: -9999 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const tooltipNode = tooltipRef.current;
    const width = Number(tooltipNode?.offsetWidth || 320);
    const height = Number(tooltipNode?.offsetHeight || 180);
    const gap = 10;
    const viewportW = Number(window.innerWidth || 0);
    const viewportH = Number(window.innerHeight || 0);

    let top = rect.bottom + gap;
    if (top + height > viewportH - 8 && rect.top - gap - height > 8) {
      top = rect.top - gap - height;
    }

    let left = rect.left;
    left = clamp(left, 8, Math.max(8, viewportW - width - 8));

    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const onRelayout = () => updatePosition();
    window.addEventListener("resize", onRelayout);
    window.addEventListener("scroll", onRelayout, true);
    const raf = window.requestAnimationFrame(onRelayout);
    return () => {
      window.removeEventListener("resize", onRelayout);
      window.removeEventListener("scroll", onRelayout, true);
      window.cancelAnimationFrame(raf);
    };
  }, [open, updatePosition]);

  if (!normalized) return null;

  const tooltip = open && typeof document !== "undefined"
    ? createPortal(
      <div
        id={tooltipId}
        ref={tooltipRef}
        role="tooltip"
        className="dodExplainTooltipPortal"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
      >
        <div className="dodExplainTooltipHead">
          {normalized.code ? <span className="dodExplainTooltipCode">{normalized.code}</span> : null}
          <span className="dodExplainTooltipLabel">{normalized.label}</span>
        </div>
        {normalized.description ? <div className="dodExplainTooltipDescription">{normalized.description}</div> : null}
        <div className="dodExplainTooltipLine"><b>Что проверяется:</b> {normalized.whatChecked || normalized.description || "—"}</div>
        <div className="dodExplainTooltipLine"><b>Как считается:</b> {normalized.howCalculated || "—"}</div>
        <div className="dodExplainTooltipLine"><b>Источник:</b> {normalized.source || "—"}</div>
        <div className="dodExplainTooltipLine"><b>Влияние:</b> {normalized.impact || "—"}</div>
        {normalized.kind || normalized.isCanonical !== null ? (
          <div className="dodExplainTooltipLine">
            <b>Классификация:</b>{" "}
            {normalized.kind === "canonical_supporting" ? "Canonical supporting artifact"
              : normalized.kind === "secondary" ? "Secondary artifact"
              : normalized.kind === "non_canonical" ? "Non-canonical (informational)"
              : normalized.isCanonical === true ? "Canonical"
              : normalized.isCanonical === false ? "Non-canonical"
              : "—"}
            {normalized.isBlocking === true ? " · Blocking" : ""}
          </div>
        ) : null}
      </div>,
      document.body,
    )
    : null;

  return (
    <span
      className={`dodExplainTrigger ${className}`.trim()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        className="dodExplainTriggerBtn"
        aria-label={`Пояснение: ${label}`}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        ?
      </button>
      {tooltip}
    </span>
  );
}
