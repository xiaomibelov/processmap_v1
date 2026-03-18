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
