import { computeDodSnapshotFromDraft } from "../dod/computeDodSnapshot";
import { renderDodSnapshotMarkdown } from "../dod/renderDodSnapshotMarkdown";

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function buildSessionDocMarkdown({ sessionId, draft, includeTechnical = false, snapshot = null }) {
  const safeDraft = asObject(draft);
  const resolvedSnapshot = snapshot && typeof snapshot === "object"
    ? snapshot
    : computeDodSnapshotFromDraft({
      draft: safeDraft,
      bpmnXml: toText(safeDraft?.bpmn_xml || safeDraft?.bpmnXml),
      uiState: {
        sessionId: toText(sessionId || safeDraft?.id || safeDraft?.session_id),
        sessionTitle: toText(safeDraft?.title || safeDraft?.name),
        processTitle: toText(safeDraft?.title || safeDraft?.name),
        version: "DoDSnapshot.v1",
      },
    });

  return renderDodSnapshotMarkdown(resolvedSnapshot, { includeTechnical });
}
