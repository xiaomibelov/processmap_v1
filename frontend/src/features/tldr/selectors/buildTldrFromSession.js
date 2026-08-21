function toText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Number(fallback || 0);
  return num;
}

function normalizeTier(rawTier) {
  const tier = toText(rawTier).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

function formatDateTimeLabel(tsRaw) {
  const ts = toNumber(tsRaw, 0);
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("ru-RU");
  } catch {
    return "—";
  }
}

function countReportVersions(interviewRaw) {
  const interview = asObject(interviewRaw);
  const byPath = asObject(interview.report_versions || interview.reportVersions);
  let total = 0;
  let latestTs = 0;
  let latestVersion = "";
  Object.values(byPath).forEach((listRaw) => {
    asArray(listRaw).forEach((rowRaw) => {
      const row = asObject(rowRaw);
      total += 1;
      const ts = toNumber(
        row?.updated_at
        || row?.updatedAt
        || row?.created_at
        || row?.createdAt,
        0,
      );
      if (ts >= latestTs) {
        latestTs = ts;
        latestVersion = toText(row?.id || row?.version || row?.version_id || row?.versionId);
      }
    });
  });
  return { total, latestTs, latestVersion };
}

function countPathCoverage(nodePathMetaRaw) {
  const nodePathMeta = asObject(nodePathMetaRaw);
  const tierCounts = { P0: 0, P1: 0, P2: 0 };
  let taggedNodes = 0;
  Object.values(nodePathMeta).forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const tiers = new Set(
      asArray(row?.paths)
        .map((tierRaw) => normalizeTier(tierRaw))
        .filter(Boolean),
    );
    if (!tiers.size) return;
    taggedNodes += 1;
    tiers.forEach((tier) => {
      tierCounts[tier] += 1;
    });
  });
  return { taggedNodes, tierCounts };
}

function readStepEntries(draftRaw) {
  const draft = asObject(draftRaw);
  const interview = asObject(draft?.interview);
  const pathSpec = asObject(interview?.path_spec || interview?.pathSpec);
  const pathSteps = asArray(pathSpec?.steps).filter((row) => row && typeof row === "object");
  if (pathSteps.length) return { source: "path_spec", steps: pathSteps };
  const interviewSteps = asArray(interview?.steps).filter((row) => row && typeof row === "object");
  if (interviewSteps.length) return { source: "interview_steps", steps: interviewSteps };
  const nodeSteps = asArray(draft?.nodes).filter((row) => row && typeof row === "object");
  if (nodeSteps.length) return { source: "nodes", steps: nodeSteps };
  return { source: "none", steps: [] };
}

function countHybridObjects(bpmnMetaRaw) {
  const meta = asObject(bpmnMetaRaw);
  const hybridV2 = asObject(meta?.hybrid_v2);
  const hybridLegacy = asObject(meta?.hybrid_layer_by_element_id);
  const elements = asArray(hybridV2?.elements).length;
  const edges = asArray(hybridV2?.edges).length;
  const legacy = Object.keys(hybridLegacy).length;
  return {
    elements,
    edges,
    legacy,
    enabled: elements > 0 || edges > 0 || legacy > 0,
  };
}

export function buildTldrFromSession(draftRaw) {
  const draft = asObject(draftRaw);
  const bpmnMeta = asObject(draft?.bpmn_meta);
  const interview = asObject(draft?.interview);
  const pathCoverage = countPathCoverage(bpmnMeta?.node_path_meta);
  const reportInfo = countReportVersions(interview);
  const stepInfo = readStepEntries(draft);
  const hybrid = countHybridObjects(bpmnMeta);
  const nodeCount = asArray(draft?.nodes).length;
  const stepsCount = asArray(stepInfo?.steps).length;
  const coverageTotal = Math.max(nodeCount, stepsCount, 0);
  const coveragePct = coverageTotal > 0
    ? Math.round((Number(pathCoverage.taggedNodes || 0) / coverageTotal) * 100)
    : 0;
  const updatedAt = Math.max(
    toNumber(draft?.updated_at || draft?.updatedAt || 0, 0),
    toNumber(bpmnMeta?.updated_at || bpmnMeta?.updatedAt || 0, 0),
    toNumber(reportInfo.latestTs || 0, 0),
  );

  const hasLiveData = stepsCount > 0
    || nodeCount > 0
    || pathCoverage.taggedNodes > 0
    || hybrid.enabled;
  const hasReportFallback = reportInfo.total > 0;
  const sourceKind = hasLiveData ? "live" : (hasReportFallback ? "report" : "none");
  const sourceLabel = sourceKind === "live"
    ? "Live"
    : (sourceKind === "report"
      ? `Report ${reportInfo.latestVersion ? `v${reportInfo.latestVersion}` : ""}`.trim()
      : "No data");

  const lines = hasLiveData
    ? [
      `Steps: ${stepsCount}${stepInfo.source !== "none" ? ` (${stepInfo.source})` : ""}`,
      `Coverage: ${coveragePct}% · P0:${pathCoverage.tierCounts.P0} P1:${pathCoverage.tierCounts.P1} P2:${pathCoverage.tierCounts.P2}`,
      `Reports: ${reportInfo.total}`,
      `Hybrid: ${hybrid.enabled ? `on (${hybrid.elements} elements, ${hybrid.edges} edges)` : "off"}`,
    ]
    : [];

  return {
    sourceKind,
    sourceLabel,
    updatedAt,
    updatedLabel: formatDateTimeLabel(updatedAt),
    empty: !hasLiveData,
    summary: lines.join("\n"),
    lines,
    metrics: {
      nodeCount,
      stepsCount,
      coveragePct,
      pathTierCounts: pathCoverage.tierCounts,
      reportsVersions: reportInfo.total,
      hybridElements: hybrid.elements,
      hybridEdges: hybrid.edges,
      hybridLegacy: hybrid.legacy,
    },
  };
}
