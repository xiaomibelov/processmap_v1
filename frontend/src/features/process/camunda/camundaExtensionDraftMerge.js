// Reconciliation between the sidebar camunda-properties draft and external
// writes to the live BPMN modeler (canvas properties popover).
//
// The sidebar keeps a per-element draft cache so unsaved edits survive tab /
// element switches. When the canvas popover writes a property value directly
// into the modeler, the derived "fresh" entry changes under the cached draft.
// These helpers replay the user's pending edits (tracked as signature ops)
// on top of the fresh entry, so:
//   - properties the user did NOT touch show the external value immediately;
//   - properties the user DID touch keep the typed value (same-name conflict
//     resolves to the user's row — matching sidebar save semantics, visibly);
//   - user-added / user-deleted rows are preserved across the external write.
//
// Row signature is `name + "\u0000" + value` — the same identity used by the
// save-time dedup (name+value keep-first).

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// An external-edit token applies to the currently viewed element at most
// once: a token for another element stays pending (it applies when the user
// switches to that element), and an already-consumed seq never re-applies.
export function shouldApplyExternalEditToken(tokenRaw, lastAppliedSeqRaw, selectedElementIdRaw) {
  const seq = Number(tokenRaw?.seq || 0);
  if (!(seq > 0)) return false;
  if (seq === Number(lastAppliedSeqRaw || 0)) return false;
  const tokenElementId = String(tokenRaw?.elementId || "");
  if (!tokenElementId) return false;
  return tokenElementId === String(selectedElementIdRaw || "");
}

export function camundaPropertyRowSignature(row) {
  return `${String(row?.name ?? "")}\u0000${String(row?.value ?? "")}`;
}

export function createCamundaDraftOps() {
  return {
    upserts: new Map(),
    removedSigs: new Set(),
  };
}

function isDraftOps(value) {
  return !!value
    && typeof value === "object"
    && value.upserts instanceof Map
    && value.removedSigs instanceof Set;
}

// Normalize a cache entry: accepts both the current `{ draft, ops }` shape
// and legacy plain-draft entries (defensive; all writers use the new shape).
export function readCamundaDraftCacheEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(raw, "draft") && raw.draft && typeof raw.draft === "object") {
    return {
      draft: raw.draft,
      ops: isDraftOps(raw.ops) ? raw.ops : createCamundaDraftOps(),
    };
  }
  return { draft: raw, ops: createCamundaDraftOps() };
}

export function readExtensionPropertyRows(draft) {
  return asArray(asObject(asObject(draft).properties).extensionProperties)
    .filter((row) => row && typeof row === "object");
}

function countSignatures(rows) {
  const counts = new Map();
  rows.forEach((row) => {
    const sig = camundaPropertyRowSignature(row);
    counts.set(sig, (counts.get(sig) || 0) + 1);
  });
  return counts;
}

// Accumulate the diff prev -> next into the ops record, keeping the record a
// NET pending diff against the model-derived baseline: an add followed by a
// removal of the same signature cancels out (the row never reached the
// model), and a delete followed by a re-add cancels too (the model row is
// back). Value edits and renames reduce to (remove old signature + add new
// signature).
export function accumulateCamundaDraftOps(opsRaw, prevDraftRaw, nextDraftRaw) {
  const ops = isDraftOps(opsRaw) ? opsRaw : createCamundaDraftOps();
  const prevCounts = countSignatures(readExtensionPropertyRows(prevDraftRaw));
  const nextRows = readExtensionPropertyRows(nextDraftRaw);
  const nextCounts = countSignatures(nextRows);
  const lastRowBySig = new Map();
  nextRows.forEach((row) => {
    lastRowBySig.set(camundaPropertyRowSignature(row), row);
  });
  const allSigs = new Set([...prevCounts.keys(), ...nextCounts.keys()]);
  allSigs.forEach((sig) => {
    const delta = (nextCounts.get(sig) || 0) - (prevCounts.get(sig) || 0);
    if (delta > 0) {
      if (ops.removedSigs.has(sig)) {
        ops.removedSigs.delete(sig);
      } else {
        ops.upserts.set(sig, lastRowBySig.get(sig));
      }
    } else if (delta < 0) {
      if (ops.upserts.has(sig)) {
        ops.upserts.delete(sig);
      } else {
        ops.removedSigs.add(sig);
      }
    }
  });
  return ops;
}

// Replay the user's pending ops on top of the freshly derived entry.
// Same-name conflict: the user's unsaved row wins over the external value and
// keeps the row's position (deterministic; the external value stays in the
// modeler until the sidebar draft is saved or discarded).
//
// Known limitations (documented): removing one of several identical
// (name, value) rows marks the whole signature as removed, so the merge drops
// all fresh rows with that signature; a renamed row moves to the end (a
// rename is remove-old-name + add-new-name). Exact duplicate rows are
// pre-save only and rare; the model is untouched until the user saves.
export function mergeCamundaDraftWithFresh(freshDraftRaw, cachedDraftRaw, opsRaw) {
  const freshDraft = freshDraftRaw && typeof freshDraftRaw === "object" ? freshDraftRaw : {};
  const ops = isDraftOps(opsRaw) ? opsRaw : createCamundaDraftOps();
  const consumedUpsertSigs = new Set();
  const pendingUpserts = [];
  ops.upserts.forEach((row, sig) => {
    if (row && typeof row === "object") pendingUpserts.push({ sig, row });
  });
  const mergedRows = [];
  readExtensionPropertyRows(freshDraft).forEach((freshRow) => {
    const freshName = String(freshRow?.name ?? "");
    const upsertIndex = pendingUpserts.findIndex(
      (entry) => !consumedUpsertSigs.has(entry.sig) && String(entry.row?.name ?? "") === freshName,
    );
    if (upsertIndex >= 0) {
      consumedUpsertSigs.add(pendingUpserts[upsertIndex].sig);
      mergedRows.push(pendingUpserts[upsertIndex].row);
      return;
    }
    if (ops.removedSigs.has(camundaPropertyRowSignature(freshRow))) return;
    mergedRows.push(freshRow);
  });
  pendingUpserts.forEach((entry) => {
    if (!consumedUpsertSigs.has(entry.sig)) mergedRows.push(entry.row);
  });
  const freshProperties = asObject(asObject(freshDraft).properties);
  const cachedProperties = asObject(asObject(cachedDraftRaw).properties);
  return {
    ...freshDraft,
    properties: {
      ...freshProperties,
      extensionProperties: mergedRows,
      // The popover can only edit property values; unsaved listener edits in
      // the cached draft must survive the merge.
      extensionListeners: asArray(cachedProperties.extensionListeners),
    },
  };
}
