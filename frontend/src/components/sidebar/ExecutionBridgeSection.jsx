import { memo, useMemo } from "react";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value) {
  return String(value || "").trim();
}

async function copyText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }
  return false;
}

function downloadJson(filename, payload) {
  if (typeof window === "undefined") return;
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  } catch {
  }
}

const CLASS_LABEL = {
  human_only: "human_only",
  assisted: "assisted",
  robot_ready: "robot_ready",
  system_triggered: "system_triggered",
  blocked: "blocked",
};

function ExecutionBridgeSection({
  sessionId = "",
  projection = null,
  selectedElementId = "",
  disabled = false,
}) {
  const model = projection && typeof projection === "object" ? projection : {};
  const summary = asObject(model.summary);
  const selectedId = asText(selectedElementId);
  const selectedNode = selectedId ? asObject(asObject(model.nodes_by_id)[selectedId]) : null;
  const payloadText = useMemo(() => JSON.stringify(model, null, 2), [model]);
  const totalNodes = Number(summary.total_nodes || 0);
  const topBlockers = asArray(summary.top_blockers);
  const overallVerdict = asText(summary.overall_handoff_verdict || "not_ready");

  const fileName = `execution_bridge_v1_${asText(sessionId) || "session"}.json`;

  return (
    <div className="sidebarControlStack" data-testid="execution-bridge-section">
      <div className="rounded-md border border-border/70 bg-panel2/35 px-2.5 py-2">
        <div className="text-[11px] font-semibold text-fg">Process handoff summary</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="selectedNodeChip">nodes {totalNodes}</span>
          <span className="selectedNodeChip">ready {Number(summary.robot_ready || 0)}</span>
          <span className="selectedNodeChip">assisted {Number(summary.assisted || 0)}</span>
          <span className="selectedNodeChip">human {Number(summary.human_only || 0)}</span>
          <span className="selectedNodeChip">triggered {Number(summary.system_triggered || 0)}</span>
          <span className={`selectedNodeChip ${Number(summary.blocked || 0) > 0 ? "selectedNodeChip--robotmeta is-incomplete" : ""}`}>
            blocked {Number(summary.blocked || 0)}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-muted">
          verdict: {overallVerdict}
        </div>
      </div>

      <div className="rounded-md border border-border/70 bg-panel2/35 px-2.5 py-2">
        <div className="text-[11px] font-semibold text-fg">Top blockers</div>
        {topBlockers.length ? (
          <div className="mt-1 grid gap-1">
            {topBlockers.slice(0, 6).map((row) => (
              <div
                key={`execution_blocker_${asText(row.code)}`}
                className="rounded border border-border/60 bg-panel/40 px-2 py-1 text-[11px]"
              >
                <span className="font-medium">{asText(row.code)}</span>
                <span className="ml-1 text-muted">({Number(row.count || 0)})</span>
                <div className="text-muted">{asText(row.message)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-muted">Blockers не обнаружены.</div>
        )}
      </div>

      <div className="rounded-md border border-border/70 bg-panel2/35 px-2.5 py-2">
        <div className="text-[11px] font-semibold text-fg">Selected node</div>
        {!selectedId ? (
          <div className="mt-1 text-[11px] text-muted">Выберите узел/flow на диаграмме для node-level handoff деталей.</div>
        ) : !selectedNode || !asText(selectedNode.node_id) ? (
          <div className="mt-1 text-[11px] text-muted">Для выбранного элемента нет execution-оценки v1.</div>
        ) : (
          <div className="mt-1 grid gap-1.5">
            <div className="text-[11px]">
              <span className="font-medium">{asText(selectedNode.node_label || selectedNode.node_id)}</span>
              <span className="ml-1 text-muted">({asText(selectedNode.bpmn_type)})</span>
            </div>
            <div className="text-[11px]">
              class:{" "}
              <span className="font-semibold">
                {CLASS_LABEL[asText(selectedNode.execution_classification)] || asText(selectedNode.execution_classification)}
              </span>
            </div>
            <div className="text-[11px] text-muted">{asText(selectedNode.rationale)}</div>
            {asArray(selectedNode.blockers).length ? (
              <div className="rounded border border-warning/35 bg-warning/10 px-2 py-1 text-[11px] text-warning">
                blockers: {asArray(selectedNode.blockers).join(", ")}
              </div>
            ) : (
              <div className="text-[11px] text-muted">blockers: none</div>
            )}
            <div className="text-[11px] text-muted">
              contracts: mode={asText(selectedNode.contracts?.robot_mode || "-")}, executor={asText(selectedNode.contracts?.executor || "-")}, action={asText(selectedNode.contracts?.action_key || "-")}
            </div>
          </div>
        )}
      </div>

      <div className="sidebarButtonRow">
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          disabled={!!disabled}
          data-testid="execution-bridge-copy-json"
          onClick={() => {
            void copyText(payloadText);
          }}
        >
          Copy JSON
        </button>
        <button
          type="button"
          className="secondaryBtn h-7 px-2 text-[11px]"
          disabled={!!disabled}
          data-testid="execution-bridge-download-json"
          onClick={() => {
            downloadJson(fileName, model);
          }}
        >
          Download JSON
        </button>
      </div>
    </div>
  );
}

export default memo(ExecutionBridgeSection);

