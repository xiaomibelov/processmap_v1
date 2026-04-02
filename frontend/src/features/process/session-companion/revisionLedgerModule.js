import {
  buildBpmnVersionCarrier,
  normalizeRevisionEntry,
  normalizeRevisionLedger,
  normalizeSessionCompanion,
} from "./sessionCompanionContracts.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeAuthor(raw) {
  const value = asObject(raw);
  const id = toText(value.id || value.user_id || value.userId);
  const name = toText(value.name || value.username || value.displayName || value.full_name || value.fullName);
  const email = toText(value.email);
  return { id, name, email };
}

function resolveNextRevisionNumber(ledgerRaw) {
  const ledger = normalizeRevisionLedger(ledgerRaw);
  const fromList = ledger.revisions.reduce((max, row) => {
    const revisionNumber = Number(row?.revision_number || 0);
    return Number.isFinite(revisionNumber) ? Math.max(max, Math.max(0, Math.round(revisionNumber))) : max;
  }, 0);
  const fromLedger = Number(ledger.latest_revision_number || 0);
  return Math.max(fromList, Number.isFinite(fromLedger) ? fromLedger : 0) + 1;
}

export function appendRevisionToLedger(companionRaw, {
  xml = "",
  draft = null,
  liveVersionRaw = null,
  author = null,
  comment = "",
  source = "manual_publish",
  createdAt = "",
  restoredFromRevisionId = "",
  skipIfContentUnchanged = false,
} = {}) {
  const xmlText = String(xml || "");
  if (!xmlText.trim()) {
    return { ok: false, error: "empty_xml", nextCompanion: normalizeSessionCompanion(companionRaw), appendedRevision: null };
  }
  const companion = normalizeSessionCompanion(companionRaw);
  const ledger = normalizeRevisionLedger(companion.revision_ledger_v1);
  const latest = ledger.revisions[0] || null;
  const xmlHash = fnv1aHex(xmlText);
  if (
    skipIfContentUnchanged === true
    && latest
    && toText(latest.content_hash) === xmlHash
  ) {
    return {
      ok: true,
      skipped: true,
      skipReason: "same_content_as_latest_revision",
      error: "",
      nextCompanion: companion,
      appendedRevision: null,
      revisionNumber: Number(ledger.latest_revision_number || 0),
    };
  }
  const revisionNumber = resolveNextRevisionNumber(ledger);
  const at = toText(createdAt) || new Date().toISOString();
  const authorRow = normalizeAuthor(author);
  const liveVersion = asObject(liveVersionRaw);
  const bpmnVersion = buildBpmnVersionCarrier({
    draft,
    xml: xmlText,
    source: toText(source) || "manual_publish",
    capturedAt: at,
  });
  if (Number(liveVersion.xmlVersion || 0) > 0) {
    bpmnVersion.xml_version = Math.max(Number(bpmnVersion.xml_version || 0), Number(liveVersion.xmlVersion || 0));
  }
  const revisionId = `rev_${revisionNumber}_${fnv1aHex(`${at}|${xmlText}`).slice(0, 10)}`;
  const entry = normalizeRevisionEntry({
    revision_id: revisionId,
    revision_number: revisionNumber,
    created_at: at,
    author: authorRow,
    comment: toText(comment),
    source: toText(source) || "manual_publish",
    restored_from_revision_id: toText(restoredFromRevisionId),
    bpmn_xml: xmlText,
    content_hash: xmlHash,
    bpmn_version: bpmnVersion,
  });
  const nextLedger = normalizeRevisionLedger({
    ...ledger,
    latest_revision_number: revisionNumber,
    latest_revision_id: entry.revision_id,
    current_revision_id: entry.revision_id,
    revisions: [entry, ...ledger.revisions],
  });
  const nextCompanion = normalizeSessionCompanion({
    ...companion,
    revision_ledger_v1: nextLedger,
  });
  return {
    ok: true,
    skipped: false,
    skipReason: "",
    error: "",
    nextCompanion,
    appendedRevision: entry,
    revisionNumber,
  };
}

export function restoreRevisionAsNewLatest(companionRaw, {
  revisionId = "",
  draft = null,
  liveVersionRaw = null,
  author = null,
  comment = "",
  source = "restore_revision",
  createdAt = "",
} = {}) {
  const companion = normalizeSessionCompanion(companionRaw);
  const ledger = normalizeRevisionLedger(companion.revision_ledger_v1);
  const targetRevisionId = toText(revisionId);
  const target = ledger.revisions.find((row) => toText(row?.revision_id) === targetRevisionId);
  if (!target) {
    return {
      ok: false,
      error: "revision_not_found",
      nextCompanion: companion,
      targetRevision: null,
      appendedRevision: null,
    };
  }
  const restoreComment = toText(comment) || `Restore r${Number(target.revision_number || 0)}`;
  const appended = appendRevisionToLedger(companion, {
    xml: String(target.bpmn_xml || ""),
    draft,
    liveVersionRaw,
    author,
    comment: restoreComment,
    source,
    createdAt,
    restoredFromRevisionId: target.revision_id,
  });
  return {
    ...appended,
    targetRevision: target,
  };
}
