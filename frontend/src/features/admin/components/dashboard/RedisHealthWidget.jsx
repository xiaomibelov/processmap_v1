import ChartCard from "../common/ChartCard";
import KeyValueGrid from "../common/KeyValueGrid";
import { toText } from "../../utils/adminFormat";

export default function RedisHealthWidget({
  payload = {},
}) {
  const mode = toText(payload.mode || "UNKNOWN");
  const modeLower = mode.toLowerCase();
  const subtitle = (
    modeLower === "on"
      ? "Redis ON: normal performance path"
      : modeLower === "fallback"
        ? "Redis unavailable: degraded fallback mode is active"
        : modeLower === "error"
          ? "Redis incident: configuration/connectivity error"
          : "Redis runtime status for persistence and queues"
  );
  return (
    <ChartCard title="Redis / Persistence Health" subtitle={subtitle} eyebrow="Persistence">
      <KeyValueGrid
        items={[
          { label: "Mode", value: mode },
          { label: "State", value: toText(payload.state || "unknown") },
          { label: "Queue Enabled", value: payload.queue_enabled ? "Yes" : "No" },
          { label: "Queue Depth", value: String(payload.queue_depth ?? 0) },
          { label: "Lock Busy Total", value: String(payload.lock_busy_total ?? 0) },
          { label: "Reason", value: toText(payload.reason || "—") || "—" },
        ]}
        columnsClassName="md:grid-cols-2 xl:grid-cols-3"
      />
    </ChartCard>
  );
}
