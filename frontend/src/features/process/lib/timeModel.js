function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toPositiveNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function unitToSeconds(value, unit) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const u = String(unit || "").toLowerCase();
  if (u.startsWith("sec")) return Math.round(amount);
  if (u.startsWith("hour")) return Math.round(amount * 3600);
  return Math.round(amount * 60);
}

function detectUnit(raw) {
  const txt = toText(raw).toLowerCase();
  if (!txt) return "";
  if (/^(сек|с|sec|second|seconds)/.test(txt)) return "sec";
  if (/^(ч|час|часа|часов|h|hr|hour|hours)/.test(txt)) return "hour";
  return "min";
}

function formatDurationSec(secRaw) {
  const sec = Number(secRaw);
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const rounded = Math.round(sec);
  if (rounded < 60) return `${rounded} сек`;
  if (rounded < 3600) {
    if (rounded % 60 === 0) return `${Math.round(rounded / 60)} мин`;
    const min = Math.floor(rounded / 60);
    const rest = rounded % 60;
    return `${min} мин ${rest} сек`;
  }
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

function unknownModel(note = "", source = "unknown") {
  return {
    time_kind: "unknown",
    duration_sec: null,
    min_sec: null,
    max_sec: null,
    expected_sec: null,
    duration_note: toText(note),
    source: toText(source) || "unknown",
    label: "—",
  };
}

function buildKnownModel({ time_kind, min_sec, max_sec, expected_sec, duration_note, source }) {
  const minVal = Number(min_sec);
  const maxVal = Number(max_sec);
  const expectedVal = Number(expected_sec);
  const minSafe = Number.isFinite(minVal) && minVal > 0 ? Math.round(minVal) : null;
  const maxSafe = Number.isFinite(maxVal) && maxVal > 0 ? Math.round(maxVal) : null;
  const expectedSafe = Number.isFinite(expectedVal) && expectedVal > 0 ? Math.round(expectedVal) : null;
  const kind = toText(time_kind) || ((minSafe && maxSafe && minSafe !== maxSafe) ? "range" : "fixed");
  const duration = expectedSafe || minSafe || maxSafe;
  if (!duration) return unknownModel(duration_note, source);
  const effectiveMin = minSafe || duration;
  const effectiveMax = maxSafe || duration;
  const effectiveExpected = expectedSafe || duration;
  const label =
    kind === "range" && effectiveMin !== effectiveMax
      ? `${formatDurationSec(effectiveMin)} - ${formatDurationSec(effectiveMax)}`
      : formatDurationSec(effectiveExpected);
  return {
    time_kind: kind === "range" ? "range" : "fixed",
    duration_sec: effectiveExpected,
    min_sec: effectiveMin,
    max_sec: effectiveMax,
    expected_sec: effectiveExpected,
    duration_note: toText(duration_note),
    source: toText(source) || "unknown",
    label,
  };
}

export function parseDurationModelFromText(textRaw, source = "annotation") {
  const text = toText(textRaw);
  if (!text) return unknownModel("", source);

  const rangeRegex = /(\d+(?:[.,]\d+)?)\s*(?:-|–|—|to|до)\s*(\d+(?:[.,]\d+)?)\s*(сек(?:унд[аы]?)?|sec(?:onds?)?|мин(?:ут[аы]?)?|min(?:ute)?s?|ч(?:ас(?:а|ов)?)?|hour(?:s)?|hr?s?)/i;
  const fixedRegex = /(\d+(?:[.,]\d+)?)\s*(сек(?:унд[аы]?)?|sec(?:onds?)?|мин(?:ут[аы]?)?|min(?:ute)?s?|ч(?:ас(?:а|ов)?)?|hour(?:s)?|hr?s?)/i;

  const range = text.match(rangeRegex);
  if (range) {
    const left = Number(String(range[1] || "").replace(",", "."));
    const right = Number(String(range[2] || "").replace(",", "."));
    const unit = detectUnit(range[3]);
    const minRaw = Math.min(left, right);
    const maxRaw = Math.max(left, right);
    const minSec = unitToSeconds(minRaw, unit);
    const maxSec = unitToSeconds(maxRaw, unit);
    if (minSec && maxSec) {
      return buildKnownModel({
        time_kind: "range",
        min_sec: minSec,
        max_sec: maxSec,
        expected_sec: Math.round((minSec + maxSec) / 2),
        duration_note: text,
        source,
      });
    }
  }

  const fixed = text.match(fixedRegex);
  if (fixed) {
    const value = Number(String(fixed[1] || "").replace(",", "."));
    const unit = detectUnit(fixed[2]);
    const sec = unitToSeconds(value, unit);
    if (sec) {
      return buildKnownModel({
        time_kind: "fixed",
        min_sec: sec,
        max_sec: sec,
        expected_sec: sec,
        duration_note: text,
        source,
      });
    }
  }

  return unknownModel(text, source);
}

export function parseStepTimeModel(stepRaw, source = "step") {
  const row = asObject(stepRaw);
  const note = toText(
    row.duration_note
      || row.durationNote
      || row.time_note
      || row.timeNote
      || row.duration_source
      || row.durationSource,
  );

  const rangeSecMin = toPositiveNumber(row.duration_sec_min ?? row.durationSecMin ?? row.step_time_sec_min ?? row.stepTimeSecMin);
  const rangeSecMax = toPositiveNumber(row.duration_sec_max ?? row.durationSecMax ?? row.step_time_sec_max ?? row.stepTimeSecMax);
  if (rangeSecMin && rangeSecMax) {
    const minSec = Math.round(Math.min(rangeSecMin, rangeSecMax));
    const maxSec = Math.round(Math.max(rangeSecMin, rangeSecMax));
    return buildKnownModel({
      time_kind: "range",
      min_sec: minSec,
      max_sec: maxSec,
      expected_sec: Math.round((minSec + maxSec) / 2),
      duration_note: note,
      source,
    });
  }

  const fixedSec = toPositiveNumber(
    row.work_duration_sec
      ?? row.workDurationSec
      ?? row.duration_sec
      ?? row.durationSec
      ?? row.step_time_sec
      ?? row.stepTimeSec
      ?? row.duration_seconds
      ?? row.durationSeconds
      ?? row.seconds,
  );
  if (fixedSec) {
    return buildKnownModel({
      time_kind: "fixed",
      min_sec: Math.round(fixedSec),
      max_sec: Math.round(fixedSec),
      expected_sec: Math.round(fixedSec),
      duration_note: note,
      source,
    });
  }

  const rangeMinMin = toPositiveNumber(row.duration_min_min ?? row.durationMinMin ?? row.step_time_min_min ?? row.stepTimeMinMin);
  const rangeMinMax = toPositiveNumber(row.duration_min_max ?? row.durationMinMax ?? row.step_time_min_max ?? row.stepTimeMinMax);
  if (rangeMinMin && rangeMinMax) {
    const minSec = Math.round(Math.min(rangeMinMin, rangeMinMax) * 60);
    const maxSec = Math.round(Math.max(rangeMinMin, rangeMinMax) * 60);
    return buildKnownModel({
      time_kind: "range",
      min_sec: minSec,
      max_sec: maxSec,
      expected_sec: Math.round((minSec + maxSec) / 2),
      duration_note: note,
      source,
    });
  }

  const fixedMin = toPositiveNumber(
    row.step_time_min
      ?? row.stepTimeMin
      ?? row.duration_min
      ?? row.durationMin,
  );
  if (fixedMin) {
    const sec = Math.round(fixedMin * 60);
    return buildKnownModel({
      time_kind: "fixed",
      min_sec: sec,
      max_sec: sec,
      expected_sec: sec,
      duration_note: note,
      source,
    });
  }

  return unknownModel(note, source);
}

export function buildNodeTimeModelByNodeId({
  nodeIds,
  stepsByNodeId,
  annotationTextsByNode,
}) {
  const out = {};
  const ids = toArray(nodeIds).map((id) => toText(id)).filter(Boolean);
  const byNodeStepMap = asObject(stepsByNodeId);
  const annotationsMap = asObject(annotationTextsByNode);

  ids.forEach((nodeId) => {
    const steps = toArray(byNodeStepMap[nodeId]);
    let stepModel = null;
    for (let i = 0; i < steps.length; i += 1) {
      const parsed = parseStepTimeModel(steps[i], "step");
      if (parsed.time_kind !== "unknown") {
        stepModel = parsed;
        break;
      }
    }
    if (stepModel) {
      out[nodeId] = stepModel;
      return;
    }

    const annotations = toArray(annotationsMap[nodeId]).map((item) => {
      if (typeof item === "string") return item;
      return toText(asObject(item).text || asObject(item).value);
    }).filter(Boolean);
    for (let i = 0; i < annotations.length; i += 1) {
      const parsed = parseDurationModelFromText(annotations[i], "annotation");
      if (parsed.time_kind !== "unknown") {
        out[nodeId] = parsed;
        return;
      }
    }

    out[nodeId] = unknownModel("", "unknown");
  });

  return out;
}

export function summarizeTimeModels(modelsRaw) {
  const models = toArray(modelsRaw);
  let expected = 0;
  let min = 0;
  let max = 0;
  let knownCount = 0;
  let rangeCount = 0;
  let unknownCount = 0;

  models.forEach((item) => {
    const model = asObject(item);
    const kind = toText(model.time_kind || model.kind).toLowerCase();
    if (kind === "unknown" || !Number.isFinite(Number(model.expected_sec || model.duration_sec)) || Number(model.expected_sec || model.duration_sec) <= 0) {
      unknownCount += 1;
      return;
    }
    const expectedSec = Number(model.expected_sec || model.duration_sec);
    const minSec = Number(model.min_sec || expectedSec);
    const maxSec = Number(model.max_sec || expectedSec);
    expected += expectedSec;
    min += Number.isFinite(minSec) && minSec > 0 ? minSec : expectedSec;
    max += Number.isFinite(maxSec) && maxSec > 0 ? maxSec : expectedSec;
    knownCount += 1;
    if (kind === "range" || minSec !== maxSec) rangeCount += 1;
  });

  if (!knownCount) {
    return {
      time_kind: "unknown",
      expected_sec: null,
      min_sec: null,
      max_sec: null,
      worst_sec: null,
      known_count: 0,
      unknown_count: unknownCount,
      total_count: models.length,
      has_unknown: unknownCount > 0,
      label: "—",
      expected_label: "—",
      worst_label: "—",
    };
  }

  const kind = rangeCount > 0 || unknownCount > 0 || min !== max ? "range" : "fixed";
  const expectedLabel = formatDurationSec(expected);
  const worstLabel = formatDurationSec(max);
  let label = kind === "range" ? `${formatDurationSec(min)} - ${formatDurationSec(max)}` : expectedLabel;
  if (unknownCount > 0) label = `${label} + ?`;
  return {
    time_kind: kind,
    expected_sec: Math.round(expected),
    min_sec: Math.round(min),
    max_sec: Math.round(max),
    worst_sec: Math.round(max),
    known_count: knownCount,
    unknown_count: unknownCount,
    total_count: models.length,
    has_unknown: unknownCount > 0,
    label,
    expected_label: expectedLabel,
    worst_label: worstLabel,
  };
}

function hasKnownSeconds(summaryRaw) {
  const summary = asObject(summaryRaw);
  return Number(summary.known_count || 0) > 0
    && Number.isFinite(Number(summary.expected_sec))
    && Number(summary.expected_sec) > 0;
}

function summaryFromAggregate(aggregateRaw) {
  const aggregate = asObject(aggregateRaw);
  const expectedSec = Number(aggregate.expected_sec || 0);
  const minSec = Number(aggregate.min_sec || expectedSec || 0);
  const maxSec = Number(aggregate.max_sec || expectedSec || 0);
  const knownCount = Math.max(0, Number(aggregate.known_count || 0));
  const unknownCount = Math.max(0, Number(aggregate.unknown_count || 0));
  const hasLoop = !!aggregate.has_loop;
  if (!knownCount) {
    const unknown = summarizeTimeModels(Array.from({ length: Math.max(1, unknownCount) }, () => ({ time_kind: "unknown" })));
    return {
      ...unknown,
      has_loop: hasLoop,
      label_with_loop: hasLoop ? `${unknown.label} + loop` : unknown.label,
    };
  }
  const baseModel = {
    time_kind: minSec !== maxSec ? "range" : "fixed",
    expected_sec: Math.round(expectedSec),
    min_sec: Math.round(minSec),
    max_sec: Math.round(maxSec),
  };
  const merged = summarizeTimeModels([
    baseModel,
    ...Array.from({ length: unknownCount }, () => ({ time_kind: "unknown" })),
  ]);
  return {
    ...merged,
    has_loop: hasLoop,
    label_with_loop: hasLoop ? `${merged.label} + loop` : merged.label,
  };
}

function addBranchAggregate(leftRaw, rightRaw) {
  const left = asObject(leftRaw);
  const right = asObject(rightRaw);
  return {
    expected_sec: Number(left.expected_sec || 0) + Number(right.expected_sec || 0),
    min_sec: Number(left.min_sec || 0) + Number(right.min_sec || 0),
    max_sec: Number(left.max_sec || 0) + Number(right.max_sec || 0),
    known_count: Number(left.known_count || 0) + Number(right.known_count || 0),
    unknown_count: Number(left.unknown_count || 0) + Number(right.unknown_count || 0),
    has_loop: !!left.has_loop || !!right.has_loop,
  };
}

function stepAggregateForNode(nodeRaw, nodeTimeByNodeId) {
  const node = asObject(nodeRaw);
  const nodeId = toText(node.nodeId || node.bpmnId || node.targetNodeId);
  const map = asObject(nodeTimeByNodeId);
  const model = asObject(map[nodeId]);
  const kind = toText(model.time_kind).toLowerCase();
  if (!nodeId || kind === "unknown") {
    return {
      expected_sec: 0,
      min_sec: 0,
      max_sec: 0,
      known_count: 0,
      unknown_count: nodeId ? 1 : 0,
      has_loop: false,
    };
  }
  const expectedSec = Number(model.expected_sec || model.duration_sec || 0);
  const minSec = Number(model.min_sec || expectedSec || 0);
  const maxSec = Number(model.max_sec || expectedSec || 0);
  if (!(expectedSec > 0)) {
    return {
      expected_sec: 0,
      min_sec: 0,
      max_sec: 0,
      known_count: 0,
      unknown_count: 1,
      has_loop: false,
    };
  }
  return {
    expected_sec: expectedSec,
    min_sec: minSec > 0 ? minSec : expectedSec,
    max_sec: maxSec > 0 ? maxSec : expectedSec,
    known_count: 1,
    unknown_count: 0,
    has_loop: false,
  };
}

function summarizeBranchNodeAggregate(nodeRaw, nodeTimeByNodeId) {
  const node = asObject(nodeRaw);
  const kind = toText(node.kind).toLowerCase();
  if (!kind || kind === "continue") {
    return {
      expected_sec: 0,
      min_sec: 0,
      max_sec: 0,
      known_count: 0,
      unknown_count: 0,
      has_loop: false,
    };
  }
  if (kind === "loop") {
    return {
      expected_sec: 0,
      min_sec: 0,
      max_sec: 0,
      known_count: 0,
      unknown_count: 0,
      has_loop: true,
    };
  }
  if (kind === "step" || kind === "terminal") {
    return stepAggregateForNode(node, nodeTimeByNodeId);
  }
  if (kind === "decision") {
    const branches = toArray(node.branches);
    if (!branches.length) return stepAggregateForNode(node, nodeTimeByNodeId);
    const branchAggs = branches.map((branch) => summarizeBranchNodesAggregate(branch?.children, nodeTimeByNodeId));
    const primary = branchAggs.find((_, idx) => !!branches[idx]?.isPrimary) || branchAggs[0];
    const known = branchAggs.filter((agg) => Number(agg.known_count || 0) > 0);
    const minSec = known.length ? Math.min(...known.map((agg) => Number(agg.min_sec || 0))) : 0;
    const maxSec = known.length ? Math.max(...known.map((agg) => Number(agg.max_sec || 0))) : 0;
    return {
      expected_sec: Number(primary?.expected_sec || 0),
      min_sec: minSec,
      max_sec: maxSec,
      known_count: Number(primary?.known_count || 0),
      unknown_count: Number(primary?.unknown_count || 0) + (known.length ? 0 : 1),
      has_loop: branchAggs.some((agg) => !!agg.has_loop),
    };
  }
  if (kind === "parallel") {
    const branches = toArray(node.branches);
    const branchAggs = branches.map((branch) => summarizeBranchNodesAggregate(branch?.children, nodeTimeByNodeId));
    const known = branchAggs.filter((agg) => Number(agg.known_count || 0) > 0);
    if (!known.length) {
      return {
        expected_sec: 0,
        min_sec: 0,
        max_sec: 0,
        known_count: 0,
        unknown_count: branchAggs.some((agg) => Number(agg.unknown_count || 0) > 0) ? 1 : 0,
        has_loop: branchAggs.some((agg) => !!agg.has_loop),
      };
    }
    return {
      // Parallel branches run concurrently: path duration is bounded by the longest branch.
      expected_sec: Math.max(...known.map((agg) => Number(agg.expected_sec || 0))),
      min_sec: Math.max(...known.map((agg) => Number(agg.min_sec || 0))),
      max_sec: Math.max(...known.map((agg) => Number(agg.max_sec || 0))),
      known_count: 1,
      unknown_count: branchAggs.some((agg) => Number(agg.unknown_count || 0) > 0) ? 1 : 0,
      has_loop: branchAggs.some((agg) => !!agg.has_loop),
    };
  }
  return stepAggregateForNode(node, nodeTimeByNodeId);
}

function summarizeBranchNodesAggregate(nodesRaw, nodeTimeByNodeId) {
  let aggregate = {
    expected_sec: 0,
    min_sec: 0,
    max_sec: 0,
    known_count: 0,
    unknown_count: 0,
    has_loop: false,
  };
  toArray(nodesRaw).forEach((node) => {
    aggregate = addBranchAggregate(aggregate, summarizeBranchNodeAggregate(node, nodeTimeByNodeId));
  });
  return aggregate;
}

export function summarizeBranchNodesTime(nodesRaw, nodeTimeByNodeId) {
  const aggregate = summarizeBranchNodesAggregate(nodesRaw, nodeTimeByNodeId);
  return summaryFromAggregate(aggregate);
}

export function summarizeBranchesTime(branchesRaw, nodeTimeByNodeId) {
  const branches = toArray(branchesRaw).map((branch) => {
    const summary = summarizeBranchNodesTime(branch?.children, nodeTimeByNodeId);
    return {
      key: toText(branch?.key),
      label: toText(branch?.label),
      isPrimary: !!branch?.isPrimary,
      summary,
    };
  });
  const primary = branches.find((branch) => branch.isPrimary) || branches[0] || null;
  const known = branches
    .map((branch) => asObject(branch.summary))
    .filter((summary) => hasKnownSeconds(summary));
  if (!primary) {
    return {
      time_kind: "unknown",
      expected_sec: null,
      min_sec: null,
      max_sec: null,
      label: "—",
      expected_label: "—",
      worst_label: "—",
      has_loop: false,
      best_case_label: "—",
      worst_case_label: "—",
      branches,
    };
  }
  const primarySummary = asObject(primary.summary);
  const bestCaseSec = known.length ? Math.min(...known.map((summary) => Number(summary.min_sec || summary.expected_sec || 0))) : null;
  const worstCaseSec = known.length ? Math.max(...known.map((summary) => Number(summary.max_sec || summary.expected_sec || 0))) : null;
  return {
    ...primarySummary,
    has_loop: branches.some((branch) => !!asObject(branch.summary).has_loop),
    best_case_sec: Number.isFinite(Number(bestCaseSec)) && Number(bestCaseSec) > 0 ? Math.round(Number(bestCaseSec)) : null,
    worst_case_sec: Number.isFinite(Number(worstCaseSec)) && Number(worstCaseSec) > 0 ? Math.round(Number(worstCaseSec)) : null,
    best_case_label: Number.isFinite(Number(bestCaseSec)) && Number(bestCaseSec) > 0 ? formatDurationSec(Number(bestCaseSec)) : "—",
    worst_case_label: Number.isFinite(Number(worstCaseSec)) && Number(worstCaseSec) > 0 ? formatDurationSec(Number(worstCaseSec)) : "—",
    label_with_loop: branches.some((branch) => !!asObject(branch.summary).has_loop)
      ? `${toText(primarySummary.label) || "—"} + loop`
      : toText(primarySummary.label) || "—",
    branches,
  };
}

export function formatTimeModelLabel(modelRaw) {
  const model = asObject(modelRaw);
  return toText(model.label) || summarizeTimeModels([model]).label;
}

export function formatTimeSummaryLabel(summaryRaw) {
  return toText(asObject(summaryRaw).label) || "—";
}

export function toTimeDisplayValue(secRaw) {
  return formatDurationSec(secRaw);
}
