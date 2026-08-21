/**
 * Save diagnostics trail.
 *
 * Lightweight in-memory ring buffer of recent save/version-related events
 * (session load, CAS tracker changes, save pipelines, conflict gates).
 * When a DIAGRAM_STATE_CONFLICT occurs, the tail of this trail is shipped
 * to the telemetry endpoint so the root cause can be reconstructed later.
 */

import { sendTelemetryEvent } from "../telemetry/telemetryClient.js";
import {
  getVersion,
  getVersionHistory,
  setVersionDiagnosticRecorder,
} from "../../lib/casVersionTracker.js";

const MAX_EVENTS = 50;
const MAX_TRAIL_IN_REPORT = 20;
const MAX_DETAIL_TEXT = 256;

const events = [];

function nowTs() {
  return Date.now();
}

function normalizeType(value) {
  return String(value || "").trim() || "unknown";
}

function normalizeDetailValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length <= MAX_DETAIL_TEXT ? value : `${value.slice(0, MAX_DETAIL_TEXT)}...[truncated]`;
  }
  try {
    const text = JSON.stringify(value);
    return normalizeDetailValue(String(text || ""));
  } catch {
    return String(value);
  }
}

/**
 * Append an event to the ring buffer.
 * @param {string} type event type, e.g. "pipeline_conflict"
 * @param {object} [details] small primitive payload (sid, versions, pipeline...)
 * @returns {object} the stored entry
 */
export function recordSaveDiagnostic(type, details = {}) {
  const entry = {
    ts: nowTs(),
    type: normalizeType(type),
  };
  if (details && typeof details === "object") {
    for (const [key, value] of Object.entries(details)) {
      if (key === "ts" || key === "type") continue;
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) continue;
      entry[normalizedKey] = normalizeDetailValue(value);
    }
  }
  events.push(entry);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  if (typeof window !== "undefined") {
    window.__FPC_SAVE_DIAG__ = events;
  }
  return entry;
}

/**
 * Return a copy of the current trail (oldest first).
 * @returns {Array<object>}
 */
export function getSaveDiagnosticsTrail() {
  return events.slice();
}

function pickConflictNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) return Math.round(num);
  }
  return null;
}

function pickConflictText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

/**
 * Build the telemetry context payload for a save conflict report.
 * Exported separately for tests.
 */
export function buildSaveConflictReportContext({
  sessionId = "",
  pipeline = "",
  conflict = null,
  userReported = false,
} = {}) {
  const c = conflict && typeof conflict === "object" ? conflict : {};
  const lastWrite = c.serverLastWrite && typeof c.serverLastWrite === "object" ? c.serverLastWrite : {};
  const changedKeys = Array.isArray(c.changedKeys)
    ? c.changedKeys
    : (Array.isArray(lastWrite.changed_keys) ? lastWrite.changed_keys : []);
  const sid = String(sessionId || c.sessionId || c.session_id || "").trim();
  return {
    pipeline: String(pipeline || "").trim(),
    client_base_version: pickConflictNumber(c.clientBaseVersion, c.client_base_version),
    server_current_version: pickConflictNumber(c.serverCurrentVersion, c.server_current_version),
    tracker_version: sid ? getVersion(sid) : null,
    tracker_history: sid ? getVersionHistory(sid) : [],
    actor_user_id: pickConflictText(c.actorUserId, c.actor_user_id, lastWrite.actor_user_id),
    actor_label: pickConflictText(c.actorLabel, c.actor_label, lastWrite.actor_label),
    changed_keys: changedKeys,
    conflict_at: pickConflictNumber(c.at, lastWrite.at),
    user_reported: userReported === true,
    trail: getSaveDiagnosticsTrail().slice(-MAX_TRAIL_IN_REPORT),
  };
}

/**
 * Ship a save-conflict diagnostics event to the telemetry endpoint.
 * Never throws; safe to fire-and-forget.
 */
export async function reportSaveConflictEvent({
  sessionId = "",
  pipeline = "",
  conflict = null,
  userReported = false,
} = {}) {
  try {
    return await sendTelemetryEvent({
      source: "frontend",
      event_type: "save_conflict",
      severity: userReported === true ? "error" : "warn",
      message: userReported === true
        ? "user_reported_save_conflict"
        : "diagram_state_conflict",
      session_id: String(sessionId || "").trim() || undefined,
      context_json: buildSaveConflictReportContext({
        sessionId,
        pipeline,
        conflict,
        userReported,
      }),
    }, { bypassThrottle: userReported === true });
  } catch {
    return { ok: false, error: "report_save_conflict_failed" };
  }
}

/**
 * Reset the trail. Intended for tests only.
 */
export function __resetSaveDiagnosticsForTests() {
  events.splice(0, events.length);
  if (typeof window !== "undefined" && window.__FPC_SAVE_DIAG__) {
    window.__FPC_SAVE_DIAG__ = events;
  }
}

// Wire CAS tracker mutations into the trail (hook avoids a lib→features
// circular import: the tracker itself stays dependency-free).
setVersionDiagnosticRecorder((type, details) => {
  recordSaveDiagnostic(type, details);
});
