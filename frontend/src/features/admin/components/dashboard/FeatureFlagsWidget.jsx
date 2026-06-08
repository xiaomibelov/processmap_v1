import { useEffect, useState } from "react";
import ChartCard from "../common/ChartCard";
import { apiGetFeatureFlags, apiPatchFeatureFlags } from "../../../../lib/apiModules/featureFlagsApi";

export default function FeatureFlagsWidget() {
  const [flags, setFlags] = useState({ bpmn_fps_meter_enabled: false, canvas_profiler_enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGetFeatureFlags().then((r) => {
      if (r.ok && r.flags) {
        setFlags(r.flags);
      }
      setLoading(false);
    });
  }, []);

  const toggle = async (key) => {
    setSaving(true);
    const next = { ...flags, [key]: !flags[key] };
    const r = await apiPatchFeatureFlags({ [key]: next[key] });
    if (r.ok) {
      setFlags(r.flags || next);
    }
    setSaving(false);
  };

  return (
    <ChartCard title="Feature Flags" subtitle="Runtime toggles for canvas profiling and FPS meter" eyebrow="Settings">
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : (
          <>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={!!flags.bpmn_fps_meter_enabled}
                onChange={() => toggle("bpmn_fps_meter_enabled")}
                disabled={saving}
              />
              <span className="text-sm">Bpmn FPS Meter (visible overlay)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={!!flags.canvas_profiler_enabled}
                onChange={() => toggle("canvas_profiler_enabled")}
                disabled={saving}
              />
              <span className="text-sm">Canvas Profiler (console metrics)</span>
            </label>
          </>
        )}
      </div>
    </ChartCard>
  );
}
