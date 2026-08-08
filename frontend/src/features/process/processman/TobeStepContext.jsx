import { useMemo } from "react";
import { ru } from "../../../shared/i18n/ru";
import { buildTobeContext, formatDuration } from "./processmanView";

// LLM4 — вкладка «TO BE» панели PROCESSMAN (S2/S3/S5).
// Показывает контекст выбранного на канве узла: имя, тип, лейн, длительности и
// принадлежность маршруту. Никаких LLM-вызовов — только чтение steps + выделения.
const t = ru.processman;

function Field({ label, value, testid }) {
  return (
    <div className="small" data-testid={testid} style={{ marginBottom: 6 }}>
      <span className="muted small">{label}: </span>
      <span style={{ color: "#111827" }}>{value}</span>
    </div>
  );
}

export default function TobeStepContext({ selectedElement = null, steps = [] }) {
  const ctx = useMemo(
    () => buildTobeContext({ selectedElement, steps }),
    [selectedElement, steps],
  );

  if (!ctx.elementId) {
    return (
      <div data-testid="processman-tobe-empty" style={{ padding: 12 }}>
        <div className="small" style={{ fontWeight: 600, color: "#111827", marginBottom: 4 }}>
          {t.tobeEmptyTitle}
        </div>
        <div className="muted small">{t.tobeEmptyText}</div>
      </div>
    );
  }

  const step = ctx.step;
  const workSec = formatDuration(step?.work_duration_sec ?? step?.workDurationSec ?? 0);
  const waitSec = formatDuration(step?.wait_duration_sec ?? step?.waitDurationSec ?? 0);

  return (
    <div data-testid="processman-tobe-context" style={{ padding: 12 }}>
      <div
        className="small"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          marginBottom: 8,
          color: ctx.inRoute ? "#0f5d28" : "#8a5a00",
          background: ctx.inRoute ? "#e7f6ec" : "#fdf3d7",
        }}
        data-testid="processman-tobe-route-badge"
      >
        {ctx.inRoute ? t.tobeInRoute : t.tobeNotInRoute}
      </div>
      {!ctx.inRoute ? (
        <div
          data-testid="processman-tobe-no-step"
          style={{ border: "1px solid #f0c36d", background: "#fffaf0", borderRadius: 8, padding: 8, marginBottom: 8 }}
        >
          <div className="small" style={{ fontWeight: 600, color: "#8a5a00", marginBottom: 4 }}>
            {t.tobeNoStepTitle}
          </div>
          <div className="muted small">{t.tobeNoStepText}</div>
        </div>
      ) : null}
      <Field label={t.tobeElementName} value={ctx.name} testid="processman-tobe-name" />
      {ctx.type ? <Field label={t.tobeElementType} value={ctx.type} testid="processman-tobe-type" /> : null}
      {ctx.laneName ? <Field label={t.tobeElementLane} value={ctx.laneName} testid="processman-tobe-lane" /> : null}
      {ctx.inRoute ? (
        <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
          <div className="small" data-testid="processman-tobe-work">
            <span className="muted small">{t.tobeStepDuration}: </span>
            <span style={{ color: "#111827" }}>{workSec} {t.tobeStepDurationSuffix}</span>
          </div>
          <div className="small" data-testid="processman-tobe-wait">
            <span className="muted small">{t.tobeStepWait}: </span>
            <span style={{ color: "#111827" }}>{waitSec} {t.tobeStepDurationSuffix}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
