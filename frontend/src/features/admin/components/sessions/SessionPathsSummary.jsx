import KeyValueGrid from "../common/KeyValueGrid";
import SectionCard from "../common/SectionCard";
import StatusPill from "../common/StatusPill";
import { toInt, toText } from "../../utils/adminFormat";

export default function SessionPathsSummary({
  pathsBpmn = {},
  uniqueTasks = 0,
  uniqueGateways = 0,
}) {
  return (
    <SectionCard title="Paths / BPMN Summary" subtitle="Derived graph and path counters" eyebrow="Graph">
      <KeyValueGrid
        items={[
          { label: "BPMN XML Version", value: String(toInt(pathsBpmn?.bpmn_xml_version, 0)) },
          { label: "Session Version", value: String(toInt(pathsBpmn?.version, 0)) },
          { label: "Paths Mapped", value: <StatusPill status={pathsBpmn?.paths_mapped ? "ok" : "missing"} tone={pathsBpmn?.paths_mapped ? "ok" : "warn"} /> },
          { label: "Path Artifacts", value: String(toInt(pathsBpmn?.path_artifacts_count, 0)) },
          { label: "Graph Fingerprint", value: toText(pathsBpmn?.graph_fingerprint || "-") },
          { label: "Unique Tasks", value: String(toInt(uniqueTasks, 0)) },
          { label: "Unique Gateways", value: String(toInt(uniqueGateways, 0)) },
          { label: "P0 / P1 / P2", value: "- / - / -" },
        ]}
      />
    </SectionCard>
  );
}

