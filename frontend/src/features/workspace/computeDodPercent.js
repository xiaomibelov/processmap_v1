function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toFinite(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBool(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === "true" || normalized === "yes" || normalized === "ok") return true;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) && numeric > 0;
  }
  return false;
}

export const DOD_CHECKPOINTS_V1 = [
  { id: "bpmn_present", label: "BPMN есть", weight: 10 },
  { id: "paths_mapped", label: "Paths размечены", weight: 20 },
  { id: "interview_filled", label: "Interview заполнен", weight: 20 },
  { id: "ai_report_created", label: "AI report создан", weight: 20 },
  { id: "robotmeta_filled", label: "RobotMeta заполнен", weight: 10 },
  { id: "hybrid_or_drawio_present", label: "Hybrid/Draw.io слой", weight: 10 },
  { id: "notes_reviewed", label: "Notes/Issues reviewed", weight: 10 },
];

export function computeDodPercent(sessionRaw) {
  const session = asObject(sessionRaw);
  const artifacts = asObject(session.dod_artifacts);

  const reportsVersions = toFinite(artifacts.reports_versions, toFinite(session.reports_versions, 0));
  const needsAttention = toFinite(artifacts.needs_attention, toFinite(session.needs_attention, 0));
  const bpmnXmlVersion = toFinite(artifacts.bpmn_xml_version, toFinite(session.bpmn_xml_version, 0));
  const version = toFinite(artifacts.version, toFinite(session.version, 0));
  const pathArtifactsCount = toFinite(artifacts.path_artifacts_count, 0);
  const interviewStepsCount = toFinite(artifacts.interview_steps_count, 0);
  const robotmetaCount = toFinite(artifacts.robotmeta_count, 0);
  const hybridItemsCount = toFinite(artifacts.hybrid_items_count, 0);
  const notesItemsCount = toFinite(artifacts.notes_items_count, 0);
  const notesSummaryCount = toFinite(artifacts.notes_summary_count, 0);
  const drawioEnabled = toBool(artifacts.drawio_enabled);
  const notesTextPresent = toBool(artifacts.notes_text_present);
  const snapshotPctRaw = artifacts.dod_snapshot_pct ?? session.dod_snapshot_pct ?? session.dod_pct;
  const snapshotPct = Number.isFinite(Number(snapshotPctRaw))
    ? Math.max(0, Math.min(100, Math.round(Number(snapshotPctRaw))))
    : null;

  const state = {
    bpmn_present: toBool(artifacts.bpmn_present) || bpmnXmlVersion > 0,
    paths_mapped: toBool(artifacts.paths_mapped) || pathArtifactsCount > 0,
    interview_filled: toBool(artifacts.interview_filled) || interviewStepsCount > 0 || version > 0,
    ai_report_created: toBool(artifacts.ai_report_created) || reportsVersions > 0,
    robotmeta_filled: toBool(artifacts.robotmeta_filled) || robotmetaCount > 0,
    hybrid_or_drawio_present: toBool(artifacts.hybrid_or_drawio_present) || hybridItemsCount > 0 || drawioEnabled,
    notes_reviewed: toBool(artifacts.notes_reviewed)
      || notesSummaryCount > 0
      || notesItemsCount > 0
      || notesTextPresent
      || (needsAttention === 0 && (reportsVersions > 0 || interviewStepsCount > 0 || version > 0)),
  };

  const breakdown = DOD_CHECKPOINTS_V1.map((item) => ({
    ...item,
    done: !!state[item.id],
  }));
  const totalWeight = breakdown.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const doneWeight = breakdown.reduce((sum, item) => sum + (item.done ? Number(item.weight || 0) : 0), 0);
  const percent = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0;

  const hasAnyArtifactSignal = (
    reportsVersions > 0
    || bpmnXmlVersion > 0
    || version > 0
    || pathArtifactsCount > 0
    || interviewStepsCount > 0
    || robotmetaCount > 0
    || hybridItemsCount > 0
    || notesItemsCount > 0
    || notesSummaryCount > 0
    || drawioEnabled
    || notesTextPresent
    || Object.keys(artifacts).length > 0
  );
  const hasData = snapshotPct !== null || hasAnyArtifactSignal || doneWeight > 0;

  return {
    version: "DoDFormula.v1",
    percent: hasData ? percent : null,
    doneWeight,
    totalWeight,
    hasData,
    snapshotPct,
    breakdown,
    raw: {
      reportsVersions,
      needsAttention,
      bpmnXmlVersion,
      version,
      pathArtifactsCount,
      interviewStepsCount,
      robotmetaCount,
      hybridItemsCount,
      notesItemsCount,
      notesSummaryCount,
      drawioEnabled,
      notesTextPresent,
    },
  };
}

export function formatDodBreakdownTooltip(resultRaw) {
  const result = asObject(resultRaw);
  const breakdown = Array.isArray(result.breakdown) ? result.breakdown : [];
  if (!result.hasData || result.percent == null) return "No snapshot yet";
  const lines = [`DoD: ${Number(result.percent || 0)}%`];
  if (result.snapshotPct != null) lines.push(`Snapshot: ${Number(result.snapshotPct || 0)}%`);
  breakdown.forEach((item) => {
    const marker = item.done ? "✓" : "•";
    lines.push(`${marker} ${String(item.label || item.id)} (${Number(item.weight || 0)}%)`);
  });
  return lines.join("\n");
}

