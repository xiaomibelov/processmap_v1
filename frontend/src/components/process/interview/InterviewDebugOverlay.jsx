import { useMemo } from "react";
import { toArray, toText } from "./utils";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function downloadJson(filename, payload) {
  try {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  } catch {
  }
}

export default function InterviewDebugOverlay({
  debugData,
  sessionId,
  debugTab = "graph",
  onChangeTab,
  onClose,
}) {
  const data = asObject(debugData);
  const stats = asObject(data.graphStats);
  const detachedTop = toArray(stats.detachedTop20);
  const graphValidation = asObject(data.graphValidation);
  const validationSummary = asObject(graphValidation.summary);
  const validationIssues = toArray(graphValidation.issues);
  const mainlinePath = toArray(data.mainlinePath);
  const gatewayBlocks = toArray(data.gatewayBlocks);
  const loopMap = toArray(data.loopMap);
  const warnings = toArray(data.warnings).map((item) => toText(item)).filter(Boolean);
  const flags = asObject(data.flags);
  const requestedMode = toText(data.requestedMode) || "—";
  const effectiveMode = toText(data.effectiveMode) || "—";
  const jsonFilename = useMemo(() => {
    const sid = toText(sessionId) || "session";
    return `interview-debug-${sid}-${Date.now()}.json`;
  }, [sessionId]);

  return (
    <div className="interviewDebugOverlay rounded-xl border border-border bg-panel p-3 mt-2" data-testid="interview-debug-overlay">
      <div className="flex items-center gap-2 mb-2">
        <strong>Debug: Graph / Interview</strong>
        <button
          type="button"
          className={"secondaryBtn smallBtn " + (debugTab === "graph" ? "isActive" : "")}
          onClick={() => onChangeTab?.("graph")}
        >
          Graph
        </button>
        <button
          type="button"
          className={"secondaryBtn smallBtn " + (debugTab === "interview" ? "isActive" : "")}
          onClick={() => onChangeTab?.("interview")}
        >
          Interview
        </button>
        <button
          type="button"
          className="secondaryBtn smallBtn ml-auto"
          onClick={() => downloadJson(jsonFilename, data)}
        >
          Export debug JSON
        </button>
        <button type="button" className="secondaryBtn smallBtn" onClick={() => onClose?.()}>
          Скрыть
        </button>
      </div>

      <div className="rounded-lg border border-border/70 bg-panel2/40 p-2 mb-3">
        <div className="text-sm">
          mode: requested <strong>{requestedMode}</strong> → effective <strong>{effectiveMode}</strong>
        </div>
        <div className="text-xs muted mt-1">
          flags: v2={String(!!flags.v2Model)} · between={String(!!flags.betweenBranches)} · time={String(!!flags.timeModel)} · detached={String(!!flags.detachedFilter)}
        </div>
        {warnings.length ? (
          <div className="mt-2 text-xs text-amber-300">
            {warnings.map((warning, idx) => (
              <div key={`warn_${idx + 1}`}>• {warning}</div>
            ))}
          </div>
        ) : null}
      </div>

      {debugTab === "graph" ? (
        <div className="grid gap-3">
          <div className="rounded-lg border border-border/70 bg-panel2/40 p-2">
            <div className="font-semibold mb-1">Graph stats</div>
            <div className="text-sm">
              <div>nodes: {Number(stats.nodeCount || 0)} · flows: {Number(stats.flowCount || 0)}</div>
              <div>flowSourceMode: {toText(stats.flowSourceMode) || "—"}</div>
              <div>reachableSeedMode: {toText(stats.reachableSeedMode) || "—"}</div>
              <div>startNodeIds: {toArray(stats.startNodeIds).join(", ") || "—"}</div>
              <div>fallbackStartNodeIds: {toArray(stats.fallbackStartNodeIds).join(", ") || "—"}</div>
              <div>endNodeIds: {toArray(stats.endNodeIds).join(", ") || "—"}</div>
              <div>reachable: {Number(stats.reachableCount || 0)} · detached: {Number(stats.detachedCount || 0)}</div>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-panel2/40 p-2">
            <div className="font-semibold mb-1">Detached top 20</div>
            {!detachedTop.length ? (
              <div className="text-sm muted">Нет detached узлов.</div>
            ) : (
              <div className="overflow-auto max-h-72">
                <table className="interviewTable interviewTableCompact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>nodeId</th>
                      <th>name</th>
                      <th>type</th>
                      <th>incoming</th>
                      <th>outgoing</th>
                      <th>reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detachedTop.map((row, idx) => (
                      <tr key={`${toText(row?.nodeId)}_${idx + 1}`}>
                        <td>{idx + 1}</td>
                        <td className="font-mono">{toText(row?.nodeId)}</td>
                        <td>{toText(row?.name)}</td>
                        <td>{toText(row?.type)}</td>
                        <td>{Number(row?.incomingCount || 0)}</td>
                        <td>{Number(row?.outgoingCount || 0)}</td>
                        <td>{toText(row?.reason)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/70 bg-panel2/40 p-2">
            <div className="font-semibold mb-1">Graph validation + repair hints</div>
            <div className="text-sm mb-2">
              total: {Number(validationSummary.total || 0)}
              {" · "}orphan: {Number(validationSummary.orphan || 0)}
              {" · "}dead-end: {Number(validationSummary.deadEnd || 0)}
              {" · "}missing join: {Number(validationSummary.gatewayMissingJoin || 0)}
              {" · "}parallel: {Number(validationSummary.parallelJoin || 0)}
              {" · "}cycle(no stop): {Number(validationSummary.cycleNoStop || 0)}
            </div>
            {!validationIssues.length ? (
              <div className="text-sm muted">Проблем не найдено.</div>
            ) : (
              <div className="grid gap-2 max-h-96 overflow-auto">
                {validationIssues.slice(0, 20).map((issue, idx) => (
                  <div className="rounded border border-border/60 p-2" key={`${toText(issue?.id)}_${idx + 1}`}>
                    <div className="text-sm">
                      <strong>{toText(issue?.title) || toText(issue?.code) || "Issue"}</strong>
                      {" · "}
                      <span className="font-mono">{toText(issue?.code) || "unknown"}</span>
                      {" · "}
                      <span>{toText(issue?.severity) || "warn"}</span>
                    </div>
                    <div className="text-xs muted mt-1">
                      nodeId: <span className="font-mono">{toText(issue?.nodeId) || "—"}</span>
                    </div>
                    {toText(issue?.details) ? (
                      <div className="text-xs mt-1">{toText(issue?.details)}</div>
                    ) : null}
                    {toArray(issue?.suspiciousFlowIds).length ? (
                      <div className="text-xs mt-1">
                        suspiciousFlowIds:{" "}
                        <span className="font-mono">
                          {toArray(issue?.suspiciousFlowIds).map((id) => toText(id)).filter(Boolean).join(", ") || "—"}
                        </span>
                      </div>
                    ) : null}
                    {toArray(issue?.repairHints).length ? (
                      <div className="grid gap-1 mt-2">
                        {toArray(issue?.repairHints).slice(0, 3).map((hint, hintIdx) => (
                          <div className="rounded border border-border/50 p-1 text-xs" key={`${toText(issue?.id)}_hint_${hintIdx + 1}`}>
                            <div>
                              <strong>{toText(hint?.action) || "inspect"}</strong>
                              {toText(hint?.note) ? ` — ${toText(hint?.note)}` : ""}
                            </div>
                            {toArray(hint?.candidateSources).length ? (
                              <div>
                                source candidates:{" "}
                                {toArray(hint?.candidateSources).map((candidate) => toText(candidate?.nodeId || candidate?.id)).filter(Boolean).join(", ") || "—"}
                              </div>
                            ) : null}
                            {toArray(hint?.candidateTargets).length ? (
                              <div>
                                target candidates:{" "}
                                {toArray(hint?.candidateTargets).map((candidate) => toText(candidate?.nodeId || candidate?.id)).filter(Boolean).join(", ") || "—"}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="rounded-lg border border-border/70 bg-panel2/40 p-2">
            <div className="font-semibold mb-1">Mainline path</div>
            {!mainlinePath.length ? (
              <div className="text-sm muted">Mainline пуст.</div>
            ) : (
              <div className="overflow-auto max-h-72">
                <table className="interviewTable interviewTableCompact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>graph_path</th>
                      <th>nodeId</th>
                      <th>name</th>
                      <th>type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mainlinePath.map((row, idx) => (
                      <tr key={`${toText(row?.nodeId)}_${idx + 1}`}>
                        <td>{idx + 1}</td>
                        <td>{toText(row?.graphPath)}</td>
                        <td className="font-mono">{toText(row?.nodeId)}</td>
                        <td>{toText(row?.name)}</td>
                        <td>{toText(row?.type)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/70 bg-panel2/40 p-2">
            <div className="font-semibold mb-1">Gateway blocks</div>
            {!gatewayBlocks.length ? (
              <div className="text-sm muted">Gateway-блоки не найдены.</div>
            ) : (
              <div className="grid gap-2">
                {gatewayBlocks.map((block, idx) => (
                  <div className="rounded border border-border/60 p-2" key={`${toText(block?.anchorNodeId)}_${idx + 1}`}>
                    <div className="text-sm">
                      <strong>{toText(block?.anchorGraphNo) ? `#${toText(block?.anchorGraphNo)} ` : ""}{toText(block?.anchorTitle)}</strong>
                    </div>
                    <div className="text-xs muted">
                      anchorNodeId: <span className="font-mono">{toText(block?.anchorNodeId) || "—"}</span>
                      {" · "}
                      nextMainlineId: <span className="font-mono">{toText(block?.nextMainlineId) || "—"}</span>
                    </div>
                    <div className="overflow-auto mt-1">
                      <table className="interviewTable interviewTableCompact">
                        <thead>
                          <tr>
                            <th>label</th>
                            <th>condition</th>
                            <th>firstNodeId</th>
                            <th>stopReason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {toArray(block?.branches).map((branch, bIdx) => (
                            <tr key={`${toText(block?.anchorNodeId)}_${toText(branch?.key) || bIdx + 1}`}>
                              <td>{toText(branch?.label)}</td>
                              <td>{toText(branch?.condition) || "—"}</td>
                              <td className="font-mono">{toText(branch?.firstNodeId) || "—"}</td>
                              <td>{toText(branch?.stopReason) || "unknown"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/70 bg-panel2/40 p-2">
            <div className="font-semibold mb-1">Loop map</div>
            {!loopMap.length ? (
              <div className="text-sm muted">Loop-ов не найдено.</div>
            ) : (
              <div className="overflow-auto max-h-56">
                <table className="interviewTable interviewTableCompact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>loopNodeId</th>
                      <th>loopTargetId</th>
                      <th>anchorNodeId</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loopMap.map((row, idx) => (
                      <tr key={`${toText(row?.loopNodeId)}_${toText(row?.loopTargetId)}_${idx + 1}`}>
                        <td>{idx + 1}</td>
                        <td className="font-mono">{toText(row?.loopNodeId) || "—"}</td>
                        <td className="font-mono">{toText(row?.loopTargetId) || "—"}</td>
                        <td className="font-mono">{toText(row?.anchorNodeId) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
