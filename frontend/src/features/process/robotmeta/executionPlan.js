import {
  canonicalizeRobotMeta,
  getRobotMetaStatus,
  normalizeRobotMetaMap,
  robotMetaMissingFields,
  stableSortValue,
} from "./robotMeta.js";

export const EXECUTION_PLAN_VERSION = "v1";
const DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z";

function asText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIso(value, fallback = DEFAULT_CREATED_AT) {
  const raw = asText(value);
  if (!raw) return fallback;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : fallback;
}

function toNonNegativeInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return Math.max(0, Math.round(fallback || 0));
  return Math.round(num);
}

function toOrderIndex(value, fallback = 1) {
  const out = toNonNegativeInt(value, fallback);
  return out > 0 ? out : Math.max(1, Math.round(fallback || 1));
}

function toNullableText(value) {
  const text = asText(value);
  return text || null;
}

function toStableArray(value) {
  return asArray(value).map((item) => stableSortValue(item));
}

function shortHash(value) {
  const src = asText(value);
  return src ? src.slice(0, 10) : "hash";
}

function planVersionIdFrom(plan, createdAt, index = 0) {
  const pathId = asText(plan?.path_id) || "path";
  const hash = shortHash(plan?.steps_hash);
  const stamp = asText(createdAt).replace(/[^0-9]/g, "").slice(0, 14) || "00000000000000";
  const tail = Number(index) > 0 ? `_${Math.round(index)}` : "";
  return `exec_plan_${pathId}_${stamp}_${hash}${tail}`;
}

export function normalizeExecutionPlanVersionEntry(rawEntry, fallbackIndex = 0) {
  const entry = asObject(rawEntry);
  const plan = asObject(entry.json || entry.plan);
  const createdAt = toIso(entry.created_at || entry.createdAt || plan.generated_at || plan.generatedAt);
  const pathId = asText(entry.path_id || entry.pathId || plan.path_id);
  const stepsHash = asText(entry.steps_hash || entry.stepsHash || plan.steps_hash);
  const statsRaw = asObject(entry.stats || plan.stats);
  const stats = {
    steps_total: toNonNegativeInt(statsRaw.steps_total, 0),
    robot_ready: toNonNegativeInt(statsRaw.robot_ready, 0),
    robot_incomplete: toNonNegativeInt(statsRaw.robot_incomplete, 0),
    human_only: toNonNegativeInt(statsRaw.human_only, 0),
  };
  const id = asText(entry.id) || planVersionIdFrom(plan, createdAt, fallbackIndex + 1);
  return {
    id,
    created_at: createdAt,
    path_id: pathId,
    steps_hash: stepsHash,
    stats,
    json: plan,
  };
}

export function normalizeExecutionPlanVersionList(rawList) {
  return asArray(rawList).map((entry, idx) => normalizeExecutionPlanVersionEntry(entry, idx));
}

export function appendExecutionPlanVersionEntry(versionsRaw, planRaw) {
  const versions = normalizeExecutionPlanVersionList(versionsRaw);
  const plan = asObject(planRaw);
  const createdAt = toIso(plan.generated_at || plan.generatedAt, new Date().toISOString());
  const nextEntry = normalizeExecutionPlanVersionEntry({
    created_at: createdAt,
    path_id: asText(plan.path_id),
    steps_hash: asText(plan.steps_hash),
    stats: asObject(plan.stats),
    json: plan,
    id: planVersionIdFrom(plan, createdAt, versions.length + 1),
  }, versions.length + 1);
  return [...versions, nextEntry];
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

function buildEvents(stepRaw) {
  const step = asObject(stepRaw);
  const events = asObject(step?.events);
  return {
    emit: toStableArray(events?.emit),
    await: toStableArray(events?.await),
  };
}

function readBpmnRef(stepRaw) {
  const step = asObject(stepRaw);
  return asText(
    step.bpmn_ref
      || step.bpmnRef
      || step.node_bind_id
      || step.nodeBindId
      || step.node_id
      || step.nodeId,
  );
}

function readLane(stepRaw) {
  const step = asObject(stepRaw);
  return toNullableText(step.lane_name || step.laneName || step.lane_id || step.laneId || step.lane || step.role || step.area);
}

function readStepName(stepRaw, orderIndex) {
  const step = asObject(stepRaw);
  return asText(step.title || step.name || step.action) || `Step ${orderIndex}`;
}

function issueKey(issueRaw) {
  const issue = asObject(issueRaw);
  return [
    asText(issue.code),
    asText(issue.bpmn_id),
    toOrderIndex(issue.order_index, 0),
    asText(issue.severity),
  ].join("::");
}

export function collectExecutionPlanIssues(stepsRaw) {
  const issues = [];
  const seen = new Set();
  asArray(stepsRaw).forEach((stepRaw) => {
    const step = asObject(stepRaw);
    const orderIndex = toOrderIndex(step.order_index, 0);
    const bpmnId = asText(step.bpmn_id);
    const robot = step.robot ? canonicalizeRobotMeta(step.robot) : null;
    const robotStatus = asText(step.robot_status || getRobotMetaStatus(robot)).toLowerCase();

    if (!bpmnId) {
      const issue = {
        code: "MISSING_BPMN_REF",
        bpmn_id: "",
        order_index: orderIndex,
        severity: "error",
      };
      const key = issueKey(issue);
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    }

    if (robotStatus === "incomplete") {
      const missing = robotMetaMissingFields(robot);
      if (missing.includes("action_key")) {
        const issue = {
          code: "MISSING_ACTION_KEY",
          bpmn_id: bpmnId,
          order_index: orderIndex,
          severity: "warn",
        };
        const key = issueKey(issue);
        if (!seen.has(key)) {
          seen.add(key);
          issues.push(issue);
        }
      }
      if (missing.includes("executor")) {
        const issue = {
          code: "MISSING_EXECUTOR",
          bpmn_id: bpmnId,
          order_index: orderIndex,
          severity: "warn",
        };
        const key = issueKey(issue);
        if (!seen.has(key)) {
          seen.add(key);
          issues.push(issue);
        }
      }
    }

    if (robot && robot.qc?.critical && asArray(robot.qc?.checks).length === 0) {
      const issue = {
        code: "QC_CRITICAL_NO_CHECKS",
        bpmn_id: bpmnId,
        order_index: orderIndex,
        severity: "warn",
      };
      const key = issueKey(issue);
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    }
  });
  return issues.sort((a, b) => (
    toOrderIndex(a.order_index, 0) - toOrderIndex(b.order_index, 0)
    || asText(a.code).localeCompare(asText(b.code), "en")
  ));
}

export async function computeExecutionPlanHash(hashInputRaw) {
  const canonical = JSON.stringify(stableSortValue(asObject(hashInputRaw)));
  return sha256HexFromText(canonical);
}

export async function buildExecutionPlan({
  sessionId,
  projectId,
  pathId,
  scenarioLabel,
  generatedAt,
  steps: stepsRaw,
  robotMetaByElementId,
  bpmnTypeById,
} = {}) {
  const robotMetaMap = normalizeRobotMetaMap(robotMetaByElementId);
  const typeById = asObject(bpmnTypeById);
  const sourceSteps = asArray(stepsRaw)
    .map((stepRaw, idx) => {
      const step = asObject(stepRaw);
      const orderIndex = toOrderIndex(step.order_index || step.order, idx + 1);
      const bpmnId = readBpmnRef(step);
      const robot = bpmnId && robotMetaMap[bpmnId] ? canonicalizeRobotMeta(robotMetaMap[bpmnId]) : null;
      const robotStatus = getRobotMetaStatus(robot);
      return {
        order_index: orderIndex,
        step_id: toNullableText(step.step_id || step.stepId || step.id),
        bpmn_id: toNullableText(bpmnId),
        bpmn_type: toNullableText(step.bpmn_type || step.bpmnType || typeById[bpmnId]),
        name: readStepName(step, orderIndex),
        lane: readLane(step),
        time: {
          work_sec: toNonNegativeInt(
            step.work_duration_sec ?? step.workDurationSec ?? step.work_sec ?? step.duration_sec ?? step.step_time_sec,
            0,
          ),
          wait_sec: toNonNegativeInt(
            step.wait_duration_sec ?? step.waitDurationSec ?? step.wait_sec,
            0,
          ),
        },
        robot,
        robot_status: robotStatus,
        required_inputs: robot ? toStableArray(robot?.mat?.inputs) : [],
        events: buildEvents(step),
      };
    })
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));

  const hashInput = {
    steps: sourceSteps.map((step) => {
      const out = {
        order_index: Number(step.order_index || 0),
        bpmn_id: toNullableText(step.bpmn_id),
        work_sec: toNonNegativeInt(step?.time?.work_sec, 0),
        wait_sec: toNonNegativeInt(step?.time?.wait_sec, 0),
        robot: step.robot ? canonicalizeRobotMeta(step.robot) : null,
      };
      return out;
    }),
  };
  const stepsHash = await computeExecutionPlanHash(hashInput);
  const issues = collectExecutionPlanIssues(sourceSteps);
  const stats = {
    steps_total: sourceSteps.length,
    robot_ready: sourceSteps.filter((step) => asText(step.robot_status) === "ready").length,
    robot_incomplete: sourceSteps.filter((step) => asText(step.robot_status) === "incomplete").length,
    human_only: sourceSteps.filter((step) => asText(step.robot_status) === "none").length,
  };
  return {
    plan_version: EXECUTION_PLAN_VERSION,
    session_id: asText(sessionId),
    project_id: asText(projectId),
    path_id: asText(pathId),
    scenario_label: asText(scenarioLabel) || "P0 Ideal",
    generated_at: toIso(generatedAt, new Date().toISOString()),
    steps_hash: stepsHash,
    stats,
    steps: sourceSteps,
    issues,
  };
}
