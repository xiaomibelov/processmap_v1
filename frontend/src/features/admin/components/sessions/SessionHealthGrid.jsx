import HealthBadge from "../common/HealthBadge";
import SectionCard from "../common/SectionCard";
import { toText } from "../../utils/adminFormat";

export default function SessionHealthGrid({
  health = {},
}) {
  return (
    <SectionCard title="Health Grid" subtitle="Cross-stage readiness and failure posture" eyebrow="Overview">
      <div className="flex flex-wrap gap-2">
        <HealthBadge label={`BPMN ${health?.bpmn ? "ok" : "missing"}`} healthy={Boolean(health?.bpmn)} />
        <HealthBadge label={`Interview ${health?.interview ? "ok" : "missing"}`} healthy={Boolean(health?.interview)} />
        <HealthBadge label={`Paths ${health?.paths ? "ok" : "missing"}`} healthy={Boolean(health?.paths)} />
        <HealthBadge label={`AutoPass ${toText(health?.autopass || "idle")}`} healthy={toText(health?.autopass) === "done"} warning={toText(health?.autopass) === "failed"} />
        <HealthBadge label={`Reports ${health?.reports ? "ok" : "missing"}`} healthy={Boolean(health?.reports)} />
        <HealthBadge label={`Doc ${health?.doc ? "ok" : "missing"}`} healthy={Boolean(health?.doc)} />
      </div>
    </SectionCard>
  );
}

