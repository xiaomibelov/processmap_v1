import { useEffect, useState } from "react";
import ChartCard from "../common/ChartCard";
import { apiGetFeatureFlags, apiPatchFeatureFlags } from "../../../../lib/apiModules/featureFlagsApi";

const DEFAULT_LABELS = {
  bpmn_fps_meter_enabled: "Bpmn FPS Meter (visible overlay)",
  canvas_profiler_enabled: "Canvas Profiler (console metrics)",
  lightweightOverlays: "Lightweight Overlays (JSON instead of XML)",
  __FPC_OVERLAY_V2__: "Hybrid Overlay V2 (white cards, anchor lines)",
};

export default function FeatureFlagsWidget() {
  const [flags, setFlags] = useState({});
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

  const flagKeys = Object.keys(flags);

  return (
    <ChartCard title="Feature Flags" subtitle="Runtime toggles returned by /api/feature-flags" eyebrow="Settings">
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : flagKeys.length === 0 ? (
          <div className="text-sm text-muted">No flags available</div>
        ) : (
          flagKeys.map((key) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={!!flags[key]}
                onChange={() => toggle(key)}
                disabled={saving}
              />
              <span className="text-sm">{DEFAULT_LABELS[key] || key}</span>
            </label>
          ))
        )}
      </div>
    </ChartCard>
  );
}
