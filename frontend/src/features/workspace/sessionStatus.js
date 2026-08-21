const MANUAL_SESSION_STATUS_ALIASES = {
  draft: "draft",
  in_work: "in_progress",
  inprogress: "in_progress",
  in_progress: "in_progress",
  review: "review",
  on_review: "review",
  ready: "ready",
  done: "ready",
  archive: "archived",
  archived: "archived",
};

const MANUAL_SESSION_STATUS_SET = new Set(["draft", "in_progress", "review", "ready", "archived"]);

// Mirrors backend/app/session_status.py SESSION_STATUS_TRANSITIONS.
const SESSION_STATUS_TRANSITIONS = {
  draft: new Set(["draft", "in_progress", "archived"]),
  in_progress: new Set(["draft", "in_progress", "review", "ready", "archived"]),
  review: new Set(["in_progress", "review", "ready", "archived"]),
  ready: new Set(["in_progress", "review", "ready", "archived"]),
  archived: new Set(["draft", "in_progress", "review", "ready", "archived"]),
};

export function normalizeManualSessionStatus(raw, fallback = "") {
  const value = String(raw || "").trim().toLowerCase();
  const normalized = MANUAL_SESSION_STATUS_ALIASES[value] || value;
  if (MANUAL_SESSION_STATUS_SET.has(normalized)) return normalized;
  return String(fallback || "").trim().toLowerCase();
}

export function resolveSessionStatusFromDraft(draftRaw, fallback = "draft") {
  const draft = draftRaw && typeof draftRaw === "object" ? draftRaw : {};
  const interview = draft?.interview && typeof draft.interview === "object" ? draft.interview : {};
  const interviewStatus = normalizeManualSessionStatus(interview?.status, "");
  if (interviewStatus) return interviewStatus;
  const directStatus = normalizeManualSessionStatus(draft?.status, "");
  if (directStatus) return directStatus;
  return normalizeManualSessionStatus(fallback, "draft") || "draft";
}

/**
 * Returns a Set of canonical statuses allowed from the given current status.
 * Mirrors the backend transition matrix. If the current status is unknown,
 * returns a Set containing only the current status (defensive; UI stays usable
 * but does not offer transitions the backend would reject).
 */
export function getAllowedNextStatuses(currentStatus) {
  const normalized = normalizeManualSessionStatus(currentStatus, "");
  if (!normalized) return new Set();
  const allowed = SESSION_STATUS_TRANSITIONS[normalized];
  if (allowed) return new Set(allowed);
  // Unknown status: allow staying in place only.
  return new Set([normalized]);
}
