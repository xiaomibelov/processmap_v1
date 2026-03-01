import {
  parseStepWorkDurationSec,
  parseStepWaitDurationSec,
  stableJson,
  toArray,
  toText,
} from "../utils.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stripFences(textRaw) {
  const text = toText(textRaw);
  if (!text) return "";
  if (!text.startsWith("```")) return text;
  return text
    .replace(/^```[a-zA-Z0-9_-]*\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function extractJsonCandidate(textRaw) {
  const text = stripFences(textRaw);
  if (!text) return "";
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    return text;
  }
  const startObj = text.indexOf("{");
  const endObj = text.lastIndexOf("}");
  if (startObj >= 0 && endObj > startObj) return text.slice(startObj, endObj + 1);
  const startArr = text.indexOf("[");
  const endArr = text.lastIndexOf("]");
  if (startArr >= 0 && endArr > startArr) return text.slice(startArr, endArr + 1);
  return "";
}

function extractJsonStringFieldLoose(textRaw, fieldNameRaw) {
  const text = toText(textRaw);
  const fieldName = toText(fieldNameRaw);
  if (!text || !fieldName) return "";
  const key = `"${fieldName}"`;
  const keyIdx = text.indexOf(key);
  if (keyIdx < 0) return "";
  const colonIdx = text.indexOf(":", keyIdx + key.length);
  if (colonIdx < 0) return "";
  const startQuoteIdx = text.indexOf("\"", colonIdx + 1);
  if (startQuoteIdx < 0) return "";

  let i = startQuoteIdx + 1;
  let escaped = false;
  let out = "";
  while (i < text.length) {
    const ch = text[i];
    if (escaped) {
      out += ch;
      escaped = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      i += 1;
      continue;
    }
    if (ch === "\"") {
      const tail = text.slice(i + 1).trimStart();
      if (tail.startsWith(",") || tail.startsWith("}") || tail.startsWith("```")) break;
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  if (!out) return "";
  try {
    return toText(JSON.parse(`"${out}"`));
  } catch {
    return toText(
      out
        .replaceAll("\\n", "\n")
        .replaceAll("\\r", "\r")
        .replaceAll("\\t", "\t")
        .replaceAll("\\\"", "\""),
    );
  }
}

export function normalizeReportMarkdown(reportMarkdownRaw, rawTextRaw = "") {
  const raw = toText(reportMarkdownRaw || rawTextRaw);
  if (!raw) return "";
  const candidate = extractJsonCandidate(raw);
  if (candidate) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const md = toText(parsed.report_markdown);
        if (md) return md;
      }
    } catch {
      // noop: fallback to loose extraction
    }
  }
  const loose = extractJsonStringFieldLoose(stripFences(raw), "report_markdown");
  if (loose) return loose;
  return raw;
}

function isEndNodeType(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  return type === "endevent";
}

function normalizeStopReason(raw) {
  const value = toText(raw).toUpperCase();
  if (
    value === "OK_COMPLETE"
    || value === "NO_NEXT_EDGE"
    || value === "DEAD_END_NODE"
    || value === "LINK_EVENT_UNPAIRED"
    || value === "FILTERED_OUT"
    || value === "CYCLE_GUARD_STOP"
    || value === "MISSING_REQUIRED_BINDING"
    || value === "UNKNOWN"
  ) return value;
  return "UNKNOWN";
}

function toNullableText(value) {
  const text = toText(value);
  return text ? text : null;
}

function toNullableNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function normalizeOrderIndex(valueRaw, fallback = 0) {
  const n = Number(valueRaw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  const fb = Number(fallback);
  if (Number.isFinite(fb) && fb > 0) return Math.floor(fb);
  return 0;
}

function normalizeDecision(raw) {
  const decision = asObject(raw);
  const selected_flow_id = toText(
    decision?.selected_flow_id
    || decision?.flow_id
    || decision?.selected_outgoing_flow_id,
  );
  const selected_label = toText(decision?.selected_label || decision?.label);
  const condition = toText(decision?.condition || decision?.selected_condition);
  if (!selected_flow_id && !selected_label && !condition) return null;
  return {
    selected_flow_id: selected_flow_id || null,
    selected_label: selected_label || null,
    condition: condition || null,
  };
}

function isStepRow(rowRaw) {
  const row = asObject(rowRaw);
  if (toText(row?.kind).toLowerCase() !== "row_step") return false;
  const rowType = toText(row?.row_type).toLowerCase();
  return rowType === "step" || rowType === "decision" || rowType === "terminal" || rowType === "continue";
}

function stepFromScenarioRow(rowRaw) {
  const row = asObject(rowRaw);
  const nodeId = toNullableText(row?.node_id || row?.nodeId);
  if (!nodeId) return null;
  const decision = normalizeDecision(row?.decision);
  return {
    node_id: nodeId,
    bpmn_ref: nodeId,
    title: toText(row?.title || row?.step) || null,
    lane_id: toNullableText(row?.lane_id || row?.laneId),
    lane_name: toText(row?.lane_name || row?.laneName || row?.lane) || null,
    decision,
  };
}

function appendRowsToSequence(rowsRaw, out) {
  toArray(rowsRaw).forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const kind = toText(row?.kind).toLowerCase();
    if (kind === "row_step" && isStepRow(row)) {
      const item = stepFromScenarioRow(row);
      if (item) out.push(item);
      return;
    }
    if (kind === "row_group") {
      const rowType = toText(row?.row_type).toLowerCase();
      const branches = toArray(row?.children).filter((child) => toText(child?.kind).toLowerCase() === "row_branch");
      if (branches.length) {
        if (rowType === "gateway") {
          const primary = branches.find((branch) => !!branch?.is_primary) || branches[0];
          appendRowsToSequence(primary?.children, out);
          return;
        }
        branches.forEach((branch) => appendRowsToSequence(branch?.children, out));
        return;
      }
      appendRowsToSequence(row?.children, out);
      return;
    }
    if (kind === "row_branch") {
      appendRowsToSequence(row?.children, out);
    }
  });
}

export function buildScenarioSequenceForReport(scenarioRaw) {
  const scenario = asObject(scenarioRaw);
  const fromRows = [];
  appendRowsToSequence(scenario?.rows, fromRows);
  if (fromRows.length) return fromRows;
  return toArray(scenario?.sequence)
    .map((stepRaw) => {
      const step = asObject(stepRaw);
      const node_id = toNullableText(step?.node_id || step?.nodeId || step?.bpmn_ref);
      if (!node_id) return null;
      return {
        node_id,
        bpmn_ref: node_id,
        title: toText(step?.title) || null,
        lane_id: toNullableText(step?.lane_id || step?.laneId),
        lane_name: toText(step?.lane_name || step?.laneName || step?.lane) || null,
        decision: normalizeDecision(step?.decision),
      };
    })
    .filter(Boolean);
}

function withSortedOrder(stepsRaw) {
  return toArray(stepsRaw)
    .map((step, idx) => ({
      ...(asObject(step)),
      __idx: idx,
      __order_index: normalizeOrderIndex(step?.order_index ?? step?.order, idx + 1),
    }))
    .sort((a, b) => {
      const ao = Number(a?.__order_index || 0);
      const bo = Number(b?.__order_index || 0);
      if (ao !== bo) return ao - bo;
      return Number(a?.__idx || 0) - Number(b?.__idx || 0);
    });
}

function stepNotes(stepRaw) {
  const step = asObject(stepRaw);
  const note = toText(
    step?.notes
    || step?.note
    || step?.comment
    || step?.description,
  );
  return note || null;
}

function stepLaneName(stepRaw) {
  const step = asObject(stepRaw);
  return toText(
    step?.lane_name
    || step?.laneName
    || step?.role
    || step?.area,
  ) || null;
}

function stepLaneId(stepRaw) {
  const step = asObject(stepRaw);
  return toNullableText(
    step?.lane_id
    || step?.laneId
    || step?.lane_key
    || step?.laneKey,
  );
}

function stepBpmnRef(stepRaw) {
  const step = asObject(stepRaw);
  return toNullableText(step?.bpmn_ref || step?.node_id || step?.nodeId);
}

function toPercent(missingCount, totalCount) {
  const total = Number(totalCount || 0);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const missing = Math.max(0, Number(missingCount || 0));
  return Math.round((missing / total) * 1000) / 10;
}

function buildMissingCoverage(stepsRaw) {
  const ordered = withSortedOrder(stepsRaw);
  const total = ordered.length || 0;
  let missingWork = 0;
  let missingWait = 0;
  let missingNotes = 0;
  ordered.forEach((step) => {
    if (toNullableNonNegativeInt(step?.work_duration_sec) === null) missingWork += 1;
    if (toNullableNonNegativeInt(step?.wait_duration_sec) === null) missingWait += 1;
    if (!toText(step?.notes)) missingNotes += 1;
  });
  return {
    steps_total: total,
    missing_work_duration_pct: toPercent(missingWork, total),
    missing_wait_duration_pct: toPercent(missingWait, total),
    missing_notes_pct: toPercent(missingNotes, total),
  };
}

function buildStepQueuesByNodeId(stepsRaw) {
  const ordered = withSortedOrder(stepsRaw);
  const out = {};
  ordered.forEach((stepRaw) => {
    const step = asObject(stepRaw);
    const nodeId = toText(step?.bpmn_ref || step?.node_id || step?.nodeId);
    if (!nodeId) return;
    if (!out[nodeId]) out[nodeId] = [];
    out[nodeId].push(step);
  });
  return out;
}

function takeStepByNodeId(stepQueuesByNodeId, nodeIdRaw) {
  const nodeId = toText(nodeIdRaw);
  if (!nodeId) return {};
  const queue = toArray(stepQueuesByNodeId[nodeId]);
  if (!queue.length) return {};
  if (queue.length > 1) {
    stepQueuesByNodeId[nodeId] = queue.slice(1);
  }
  return asObject(queue[0]);
}

function buildDodSummaryByOrder(stepsRaw, dodSnapshotRaw) {
  const steps = withSortedOrder(stepsRaw);
  const dodSnapshot = asObject(dodSnapshotRaw);
  const missingByNodeId = {};
  toArray(dodSnapshot?.steps).forEach((entryRaw) => {
    const entry = asObject(entryRaw);
    const nodeId = toText(entry?.bpmn?.nodeId || entry?.bpmnId || entry?.node_id);
    if (!nodeId || missingByNodeId[nodeId]) return;
    missingByNodeId[nodeId] = toArray(entry?.dod?.missing).map((x) => toText(x)).filter(Boolean);
  });
  return steps.map((step, idx) => {
    const order_index = normalizeOrderIndex(step?.order_index, idx + 1);
    const nodeId = toText(step?.bpmn_ref);
    const missing = nodeId ? toArray(missingByNodeId[nodeId]) : [];
    return { order_index, missing };
  });
}

function buildQualitySummary(dodSnapshotRaw, qualitySummaryRaw) {
  const dodSnapshot = asObject(dodSnapshotRaw);
  const qualityFromSummary = asObject(qualitySummaryRaw);
  const qualityFromDod = asObject(dodSnapshot?.quality);
  const link = asObject(qualityFromDod?.link_integrity_summary);
  const orphanCount = Math.max(
    0,
    Number(qualityFromSummary?.orphan_count || 0),
    toArray(qualityFromDod?.orphan_bpmn_nodes).length,
  );
  const deadEndCount = Math.max(
    0,
    Number(qualityFromSummary?.dead_end_count || 0),
    toArray(qualityFromDod?.dead_end_bpmn_nodes).length,
  );
  return {
    orphan_count: orphanCount,
    dead_end_count: deadEndCount,
    link_integrity: {
      total: Math.max(0, Number(link?.total || qualityFromSummary?.link_integrity?.total || 0)),
      warn: Math.max(0, Number(link?.warns || qualityFromSummary?.link_integrity?.warn || 0)),
      error: Math.max(0, Number(link?.errors || qualityFromSummary?.link_integrity?.error || 0)),
    },
  };
}

export function buildDecisionHintsByNodeIdFromScenarioRows(rowsRaw) {
  const out = {};
  function walk(list) {
    toArray(list).forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const nodeId = toText(row?.node_id);
      if (nodeId) {
        const decision = normalizeDecision(row?.decision || row);
        if (decision) out[nodeId] = decision;
      }
      walk(row?.children);
    });
  }
  walk(rowsRaw);
  return out;
}

export function buildManualPathReportSteps(interviewDataRaw, options = {}) {
  const interviewData = asObject(interviewDataRaw);
  const decisionByNodeId = asObject(options?.decisionByNodeId);
  const decisionByOrderIndex = asObject(options?.decisionByOrderIndex);
  const scenarioSequence = toArray(options?.scenarioSequence);
  const pathSpec = asObject(interviewData?.path_spec || interviewData?.pathSpec);
  const steps = withSortedOrder(interviewData?.steps);
  if (scenarioSequence.length) {
    const stepQueuesByNodeId = buildStepQueuesByNodeId(steps);
    return scenarioSequence.map((rowRaw, idx) => {
      const row = asObject(rowRaw);
      const order_index = idx + 1;
      const bpmn_ref = toNullableText(row?.node_id || row?.bpmn_ref || row?.nodeId);
      const linkedStep = takeStepByNodeId(stepQueuesByNodeId, bpmn_ref);
      const linkedDecision = normalizeDecision(linkedStep?.decision);
      const rowDecision = normalizeDecision(row?.decision);
      const decisionByNode = bpmn_ref ? normalizeDecision(decisionByNodeId[bpmn_ref]) : null;
      const decisionByOrder = normalizeDecision(decisionByOrderIndex[String(order_index)]);
      const decision = decisionByOrder || decisionByNode || rowDecision || linkedDecision;
      return {
        order_index,
        step_id: toText(linkedStep?.id) || null,
        title: toText(row?.title || linkedStep?.action || linkedStep?.title) || `Step ${order_index}`,
        lane_id: toNullableText(row?.lane_id || row?.laneId || linkedStep?.lane_id || linkedStep?.laneId || linkedStep?.lane_key || linkedStep?.role || linkedStep?.area),
        lane_name: toText(row?.lane_name || row?.laneName || linkedStep?.lane_name || linkedStep?.laneName || linkedStep?.role || linkedStep?.area) || null,
        bpmn_ref,
        work_duration_sec: toNullableNonNegativeInt(parseStepWorkDurationSec(linkedStep)),
        wait_duration_sec: toNullableNonNegativeInt(parseStepWaitDurationSec(linkedStep)),
        notes: stepNotes(linkedStep),
        decision,
        is_decision: !!decision,
      };
    });
  }
  const stepById = {};
  steps.forEach((step) => {
    const stepId = toText(step?.id);
    if (stepId && !stepById[stepId]) stepById[stepId] = step;
  });

  const pathSpecSteps = withSortedOrder(toArray(pathSpec?.steps).map((entryRaw) => {
    const entry = asObject(entryRaw);
    return {
      step_id: toText(entry?.step_id || entry?.stepId || entry?.id),
      order_index: normalizeOrderIndex(entry?.order_index ?? entry?.order),
      title: toText(entry?.title),
      lane_id: toNullableText(entry?.lane_id || entry?.laneId),
      bpmn_ref: toNullableText(entry?.bpmn_ref || entry?.node_id || entry?.nodeId),
      work_duration_sec: toNullableNonNegativeInt(entry?.work_duration_sec ?? entry?.workDurationSec),
      wait_duration_sec: toNullableNonNegativeInt(entry?.wait_duration_sec ?? entry?.waitDurationSec),
    };
  }));

  const sourceRows = pathSpecSteps.length
    ? pathSpecSteps.map((entry, idx) => {
      const linked = asObject(stepById[toText(entry?.step_id)]);
      return {
        __idx: idx,
        __order_index: normalizeOrderIndex(entry?.order_index, idx + 1),
        path_entry: entry,
        step: linked,
      };
    })
    : steps.map((step, idx) => ({
      __idx: idx,
      __order_index: normalizeOrderIndex(step?.order_index ?? step?.order, idx + 1),
      path_entry: {},
      step,
    }));

  const ordered = [...sourceRows].sort((a, b) => {
    if (a.__order_index !== b.__order_index) return a.__order_index - b.__order_index;
    return a.__idx - b.__idx;
  });

  return ordered.map((item, idx) => {
    const step = asObject(item?.step);
    const entry = asObject(item?.path_entry);
    const order_index = normalizeOrderIndex(entry?.order_index ?? step?.order_index ?? step?.order, idx + 1);
    const bpmn_ref = toNullableText(entry?.bpmn_ref || stepBpmnRef(step));
    const linkedDecision = normalizeDecision(step?.decision);
    const decisionByNode = bpmn_ref ? normalizeDecision(decisionByNodeId[bpmn_ref]) : null;
    const decisionByOrder = normalizeDecision(decisionByOrderIndex[String(order_index)]);
    const decision = decisionByOrder || decisionByNode || linkedDecision;

    const work_duration_sec = toNullableNonNegativeInt(
      entry?.work_duration_sec ?? parseStepWorkDurationSec(step),
    );
    const wait_duration_sec = toNullableNonNegativeInt(
      entry?.wait_duration_sec ?? parseStepWaitDurationSec(step),
    );

    return {
      order_index,
      step_id: toText(step?.id || entry?.step_id) || null,
      title: toText(entry?.title || step?.action || step?.title) || `Step ${order_index}`,
      lane_id: toNullableText(entry?.lane_id || stepLaneId(step)),
      lane_name: stepLaneName(step),
      bpmn_ref,
      work_duration_sec,
      wait_duration_sec,
      notes: stepNotes(step),
      decision,
      is_decision: !!decision,
    };
  });
}

export function buildCanonicalStepsJson(stepsRaw) {
  const steps = withSortedOrder(stepsRaw).map((step) => {
    const out = {
      order_index: normalizeOrderIndex(step?.order_index),
      title: toText(step?.title),
      lane_id: toNullableText(step?.lane_id),
      bpmn_ref: toNullableText(step?.bpmn_ref),
      work_duration_sec: toNullableNonNegativeInt(step?.work_duration_sec),
      wait_duration_sec: toNullableNonNegativeInt(step?.wait_duration_sec),
    };
    const decision = normalizeDecision(step?.decision);
    if (decision) out.decision = decision;
    const notes = toText(step?.notes);
    if (notes) out.notes = notes;
    return out;
  });
  return { steps };
}

async function sha256HexFromText(source) {
  const text = String(source || "");
  const subtle = globalThis?.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error("sha256_unavailable");
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeStepsHash(canonicalJson) {
  return sha256HexFromText(stableJson(canonicalJson));
}

export function buildPathReportPayload({
  sessionId,
  pathId,
  pathName,
  generatedAt,
  steps,
  totals,
  dodSnapshot,
  qualitySummary,
}) {
  const orderedSteps = withSortedOrder(steps).map((step, idx) => {
    const order_index = normalizeOrderIndex(step?.order_index, idx + 1);
    const decision = normalizeDecision(step?.decision);
    const item = {
      order_index,
      title: toText(step?.title) || `Step ${order_index}`,
      lane_name: toText(step?.lane_name) || null,
      lane_id: toNullableText(step?.lane_id),
      bpmn_ref: toNullableText(step?.bpmn_ref),
      work_duration_sec: toNullableNonNegativeInt(step?.work_duration_sec),
      wait_duration_sec: toNullableNonNegativeInt(step?.wait_duration_sec),
      is_decision: !!decision,
    };
    const notes = toText(step?.notes);
    if (notes) item.notes = notes;
    if (decision) {
      item.decision = {
        selected_label: toNullableText(decision?.selected_label),
        condition: toNullableText(decision?.condition),
        selected_flow_id: toNullableText(decision?.selected_flow_id),
      };
    }
    return item;
  });

  const computedTotals = orderedSteps.reduce((acc, step) => {
    acc.work_total_sec += Math.max(0, Number(step?.work_duration_sec || 0));
    acc.wait_total_sec += Math.max(0, Number(step?.wait_duration_sec || 0));
    return acc;
  }, { work_total_sec: 0, wait_total_sec: 0 });
  const safeTotals = asObject(totals);
  const work_total_sec = toNullableNonNegativeInt(safeTotals?.work_time_total_sec ?? safeTotals?.work_total_sec) ?? computedTotals.work_total_sec;
  const wait_total_sec = toNullableNonNegativeInt(safeTotals?.wait_time_total_sec ?? safeTotals?.wait_total_sec) ?? computedTotals.wait_total_sec;
  const total_sec = work_total_sec + wait_total_sec;
  const missing_fields_coverage = buildMissingCoverage(orderedSteps);
  const dod_summary = buildDodSummaryByOrder(orderedSteps, dodSnapshot);
  const quality_summary = buildQualitySummary(dodSnapshot, qualitySummary);

  return {
    session_id: toText(sessionId),
    path_id: toText(pathId),
    path_name: toText(pathName) || toText(pathId),
    generated_at: toText(generatedAt) || new Date().toISOString(),
    totals: {
      steps_count: orderedSteps.length,
      work_total_sec,
      wait_total_sec,
      total_sec,
    },
    missing_fields_coverage,
    dod_summary,
    quality_summary,
    steps: orderedSteps,
  };
}

export async function buildPathReportRequest({
  sessionId,
  pathId,
  pathName,
  interviewData,
  totals,
  generatedAt,
  decisionByNodeId,
  decisionByOrderIndex,
  scenarioSequence,
  dodSnapshot,
  qualitySummary,
}) {
  const steps = buildManualPathReportSteps(interviewData, {
    decisionByNodeId,
    decisionByOrderIndex,
    scenarioSequence,
  });
  const canonical_json = buildCanonicalStepsJson(steps);
  const steps_hash = await computeStepsHash(canonical_json);
  const payload = buildPathReportPayload({
    sessionId,
    pathId,
    pathName,
    generatedAt,
    steps,
    totals,
    dodSnapshot,
    qualitySummary,
  });
  return {
    steps,
    canonical_json,
    steps_hash,
    payload,
  };
}

export function buildReportBuildDebug({
  sessionId,
  selectedScenarioLabel,
  pathIdUsed,
  scenarioRaw,
  scenarioSequence,
  steps,
  graphModel,
  dodSnapshot,
}) {
  const scenario = asObject(scenarioRaw);
  const orderedSteps = withSortedOrder(steps).map((step, idx) => ({
    order_index: normalizeOrderIndex(step?.order_index, idx + 1),
    title: toText(step?.title) || `Step ${idx + 1}`,
    bpmn_ref: toText(step?.bpmn_ref || step?.node_id || step?.nodeId),
  }));
  const stepsCount = orderedSteps.length;
  const firstStep = stepsCount ? orderedSteps[0] : null;
  const lastStep = stepsCount ? orderedSteps[stepsCount - 1] : null;
  const lastNodeId = toText(lastStep?.bpmn_ref);
  const scenarioNodeIdSet = new Set(
    toArray(scenarioSequence)
      .map((stepRaw) => toText(stepRaw?.node_id || stepRaw?.bpmn_ref || stepRaw?.nodeId))
      .filter(Boolean),
  );
  const hasMissingBinding = orderedSteps.some((step) => !toText(step?.bpmn_ref));
  const scenarioWarnings = toArray(scenario?.warnings).map((item) => toText(item).toLowerCase());
  const graph = asObject(graphModel);
  const nodesById = asObject(graph?.nodesById);
  const outgoingByNode = asObject(graph?.outgoingByNode);
  const incomingByNode = asObject(graph?.incomingByNode);
  const lastNode = asObject(nodesById[lastNodeId]);
  const outgoingCount = toArray(outgoingByNode[lastNodeId]).length;
  const incomingCount = toArray(incomingByNode[lastNodeId]).length;
  const outgoingFlows = toArray(outgoingByNode[lastNodeId]);
  const hasOutgoingInsideScenario = outgoingFlows.some((flowRaw) => scenarioNodeIdSet.has(toText(flowRaw?.targetId)));
  const hasOutgoingOutsideScenario = outgoingFlows.some((flowRaw) => !scenarioNodeIdSet.has(toText(flowRaw?.targetId)));

  let stopReason = "OK_COMPLETE";
  if (!stepsCount) {
    stopReason = toArray(scenarioSequence).length ? "FILTERED_OUT" : "UNKNOWN";
  } else if (hasMissingBinding || !lastNodeId) {
    stopReason = "MISSING_REQUIRED_BINDING";
  } else if (scenarioWarnings.some((warning) => warning === "depth_limit" || warning.startsWith("loop"))) {
    stopReason = "CYCLE_GUARD_STOP";
  } else if (lastNodeId) {
    const linkIntegrity = toArray(asObject(dodSnapshot?.quality)?.link_integrity);
    const linkError = linkIntegrity.some((itemRaw) => {
      const item = asObject(itemRaw);
      if (toText(item?.integrity).toLowerCase() !== "error") return false;
      return toArray(item?.throw_ids).includes(lastNodeId) || toArray(item?.catch_ids).includes(lastNodeId);
    });
    if (linkError) {
      stopReason = "LINK_EVENT_UNPAIRED";
    } else if (isEndNodeType(lastNode?.type)) {
      stopReason = "OK_COMPLETE";
    } else if (outgoingCount > 0 && !hasOutgoingInsideScenario && hasOutgoingOutsideScenario) {
      stopReason = "FILTERED_OUT";
    } else if (toArray(scenarioSequence).length > stepsCount) {
      stopReason = "FILTERED_OUT";
    } else if (outgoingCount === 0) {
      const deadEndNodeIds = toArray(asObject(dodSnapshot?.quality)?.dead_end_bpmn_nodes).map((id) => toText(id));
      stopReason = deadEndNodeIds.includes(lastNodeId) || incomingCount > 0 ? "DEAD_END_NODE" : "NO_NEXT_EDGE";
    } else {
      stopReason = "UNKNOWN";
    }
  } else {
    stopReason = "UNKNOWN";
  }

  const normalizedStopReason = normalizeStopReason(stopReason);
  return {
    session_id: toText(sessionId),
    selectedScenarioLabel: toText(selectedScenarioLabel || scenario?.label || scenario?.id || "Scenario"),
    path_id_used: toText(pathIdUsed),
    steps_count: stepsCount,
    first_step: firstStep ? {
      order_index: Number(firstStep?.order_index || 0),
      title: toText(firstStep?.title),
      bpmn_ref: toText(firstStep?.bpmn_ref),
    } : null,
    last_step: lastStep ? {
      order_index: Number(lastStep?.order_index || 0),
      title: toText(lastStep?.title),
      bpmn_ref: toText(lastStep?.bpmn_ref),
    } : null,
    stop_reason: normalizedStopReason,
    stop_at_bpmn_id: normalizedStopReason === "OK_COMPLETE" ? "" : lastNodeId,
    debug_version: "report_build_debug_v1",
    computed_at_iso: new Date().toISOString(),
  };
}

export function isReportVersionActual(reportRaw, currentStepsHashRaw) {
  const report = asObject(reportRaw);
  const reportHash = toText(report?.steps_hash);
  const currentHash = toText(currentStepsHashRaw);
  return !!(reportHash && currentHash && reportHash === currentHash);
}

export function decorateReportVersionsWithActuality(versionsRaw, currentStepsHashRaw) {
  const versions = toArray(versionsRaw);
  let markedLatest = false;
  return versions.map((itemRaw) => {
    const item = asObject(itemRaw);
    const is_actual = isReportVersionActual(item, currentStepsHashRaw);
    const is_latest_actual = is_actual && !markedLatest;
    if (is_latest_actual) markedLatest = true;
    return {
      ...item,
      is_actual,
      is_latest_actual,
    };
  });
}

export function resolveStepIdForRecommendation(recommendationRaw, interviewStepsRaw) {
  const recommendation = asObject(recommendationRaw);
  if (toText(recommendation?.scope).toLowerCase() !== "step") return "";
  const order_index = normalizeOrderIndex(recommendation?.order_index);
  if (!order_index) return "";
  const orderedSteps = withSortedOrder(interviewStepsRaw);
  const step = orderedSteps.find((item) => normalizeOrderIndex(item?.order_index ?? item?.order) === order_index);
  return toText(step?.id);
}
