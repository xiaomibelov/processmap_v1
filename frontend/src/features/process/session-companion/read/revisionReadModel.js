import { normalizeRevisionLedger } from "../sessionCompanionContracts.js";
import { asObject, toText } from "./readModelUtils.js";

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toTimestamp(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeRevisionRows(rowsRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  return rows
    .map((row) => {
      const value = asObject(row);
      const revisionId = toText(value.revision_id || value.revisionId);
      const revisionNumber = Number(value.revision_number || value.revisionNumber || 0);
      const xml = String(value.bpmn_xml || value.bpmnXml || "");
      const createdAt = toText(value.created_at || value.createdAt);
      return {
        revisionId,
        revisionNumber: Number.isFinite(revisionNumber) ? Math.max(0, Math.round(revisionNumber)) : 0,
        createdAt,
        ts: toTimestamp(createdAt),
        authorId: toText(value.author?.id),
        authorName: toText(value.author?.name),
        authorEmail: toText(value.author?.email),
        comment: toText(value.comment),
        source: toText(value.source),
        restoredFromRevisionId: toText(value.restored_from_revision_id || value.restoredFromRevisionId),
        xml,
        len: Number(String(xml || "").length || 0),
        contentHash: toText(value.content_hash || value.contentHash || fnv1aHex(xml)),
        bpmnVersion: asObject(value.bpmn_version || value.bpmnVersion),
      };
    })
    .filter((row) => row.revisionId && row.revisionNumber > 0 && row.xml)
    .sort((a, b) => {
      if (b.revisionNumber !== a.revisionNumber) return b.revisionNumber - a.revisionNumber;
      return b.ts - a.ts;
    });
}

export default function buildSessionRevisionReadModel({
  companionRevisionLedgerRaw = null,
  companionSource = "legacy_companion",
  bridgeMode = "legacy_only",
  liveDraftRaw = null,
} = {}) {
  const ledger = normalizeRevisionLedger(companionRevisionLedgerRaw);
  const revisions = normalizeRevisionRows(ledger.revisions);
  const latest = revisions[0] || null;
  const liveDraft = asObject(liveDraftRaw);
  const liveXml = String(liveDraft.bpmn_xml || liveDraft.xml || "");
  const liveHash = liveXml ? fnv1aHex(liveXml) : "";
  const latestHash = toText(latest?.contentHash);
  const draftMatchesLatestRevision = !!liveHash && !!latestHash && liveHash === latestHash;
  const effectiveSource = revisions.length
    ? `${toText(companionSource) || "legacy_companion"}:revision_ledger_v1`
    : "missing";
  const diagnosticsSeverity = revisions.length ? "none" : "medium";
  const readinessState = revisions.length ? "healthy" : "warning";

  return {
    schemaVersion: toText(ledger.schema_version) || "revision_ledger_v1",
    latestRevisionNumber: Number(ledger.latest_revision_number || latest?.revisionNumber || 0),
    latestRevisionId: toText(ledger.latest_revision_id || latest?.revisionId),
    currentRevisionId: toText(ledger.current_revision_id || ledger.latest_revision_id || latest?.revisionId),
    totalCount: revisions.length,
    isMissing: revisions.length === 0,
    effectiveSource,
    diagnosticsSeverity,
    readinessState,
    draftState: {
      hasLiveDraft: !!liveXml,
      liveDraftHash: liveHash,
      latestRevisionHash: latestHash,
      draftMatchesLatestRevision,
      isDraftAheadOfLatestRevision: !!liveXml && !!latest && !draftMatchesLatestRevision,
    },
    revisions: revisions.map((row) => ({
      id: row.revisionId,
      revisionId: row.revisionId,
      revisionNumber: row.revisionNumber,
      createdAt: row.createdAt,
      ts: row.ts,
      authorId: row.authorId,
      authorName: row.authorName,
      authorEmail: row.authorEmail,
      comment: row.comment,
      source: row.source || "manual_publish",
      restoredFromRevisionId: row.restoredFromRevisionId,
      xml: row.xml,
      len: row.len,
      hash: row.contentHash,
      contentHash: row.contentHash,
      reason: row.source || "manual_publish",
      label: row.comment || `Revision r${row.revisionNumber}`,
      pinned: false,
      rev: row.revisionNumber,
      bpmnVersion: row.bpmnVersion,
    })),
    sourceProvenance: {
      bridgeMode: toText(bridgeMode) || "legacy_only",
      companionSource: toText(companionSource) || "legacy_companion",
      companionAvailable: revisions.length > 0,
      fallbackUsed: false,
    },
    diagnostics: {
      latestRevisionNumber: Number(ledger.latest_revision_number || 0),
      latestRevisionId: toText(ledger.latest_revision_id),
      currentRevisionId: toText(ledger.current_revision_id),
      draftMatchesLatestRevision,
      diagnosticsSeverity,
      readinessState,
    },
  };
}

