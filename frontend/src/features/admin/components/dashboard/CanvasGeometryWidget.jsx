import { useEffect, useState } from "react";
import ChartCard from "../common/ChartCard";
import { apiGetCanvasGeometry, apiPutCanvasGeometry } from "../../../../lib/apiModules/canvasGeometryApi";

// Контур feature/canvas-geometry-settings (шаг 1: хранение и чтение).
// Только редактирование значений; применение к схеме — отдельные контуры.
const FIELDS = [
  { key: "task_width", label: "Ширина таски", min: 60, max: 400 },
  { key: "task_height", label: "Высота таски", min: 60, max: 400 },
  { key: "sequence_gap", label: "Длина секвенса (зазор между нодами)", min: 20, max: 500 },
];

const DEFAULTS = { task_width: 130, task_height: 80, sequence_gap: 100 };

export default function CanvasGeometryWidget() {
  const [values, setValues] = useState({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ kind: "idle", text: "" });

  useEffect(() => {
    apiGetCanvasGeometry().then((r) => {
      if (r.ok && r.settings) setValues({ ...DEFAULTS, ...r.settings });
      setLoading(false);
    });
  }, []);

  const setField = (key, raw) => {
    setStatus({ kind: "idle", text: "" });
    setValues((prev) => ({ ...prev, [key]: raw }));
  };

  const save = async () => {
    setSaving(true);
    setStatus({ kind: "idle", text: "" });
    const payload = {};
    for (const f of FIELDS) {
      const n = Number(values[f.key]);
      if (!Number.isInteger(n) || n < f.min || n > f.max) {
        setStatus({ kind: "error", text: `${f.label}: целое число от ${f.min} до ${f.max}` });
        setSaving(false);
        return;
      }
      payload[f.key] = n;
    }
    const r = await apiPutCanvasGeometry(payload);
    if (r.ok && r.settings) {
      setValues({ ...DEFAULTS, ...r.settings });
      setStatus({ kind: "ok", text: "Сохранено" });
    } else {
      const detail = r?.error?.detail;
      const msg =
        (detail && typeof detail === "object" && (detail.message || detail.code)) ||
        (typeof detail === "string" && detail) ||
        "Ошибка сохранения";
      setStatus({ kind: "error", text: String(msg) });
    }
    setSaving(false);
  };

  return (
    <ChartCard title="Геометрия схемы" subtitle="Канон-размер таски и зазор секвенса (canvas-geometry)" eyebrow="Settings">
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : (
          <>
            {FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-3">
                <span className="text-sm w-64">{f.label}</span>
                <input
                  type="number"
                  className="h-8 w-28 rounded border border-border bg-background px-2 text-sm"
                  min={f.min}
                  max={f.max}
                  step={1}
                  value={values[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  disabled={saving}
                />
                <span className="text-xs text-muted">{f.min}–{f.max}</span>
              </label>
            ))}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                className="h-8 rounded bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
                onClick={save}
                disabled={saving || loading}
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
              {status.kind === "ok" ? (
                <span className="text-sm text-green-600">{status.text}</span>
              ) : status.kind === "error" ? (
                <span className="text-sm text-destructive">{status.text}</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </ChartCard>
  );
}
