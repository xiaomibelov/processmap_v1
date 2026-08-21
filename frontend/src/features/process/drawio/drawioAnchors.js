function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "ru");
}

export const DRAWIO_ANCHOR_TARGET_KIND = "bpmn_node";

export const DRAWIO_ANCHOR_STATUSES = Object.freeze({
  ANCHORED: "anchored",
  UNANCHORED: "unanchored",
  ORPHANED: "orphaned",
  INVALID: "invalid",
});

export const DRAWIO_ANCHOR_RELATIONS = Object.freeze({
  EXPLAINS: "explains",
  HIGHLIGHTS: "highlights",
});

export function getDrawioAnchorableKind(rowRaw = {}) {
  const row = asObject(rowRaw);
  const text = toText(row.text || row.label);
  const id = toText(row.id).toLowerCase();
  if (text || id.startsWith("text_")) return "text";
  if (id.startsWith("rect_") || id.startsWith("container_")) return "highlight";
  return "";
}

export function isDrawioAnchorableRow(rowRaw = {}) {
  return !!getDrawioAnchorableKind(rowRaw);
}

export function isSupportedDrawioAnchorRelation(relationRaw, rowRaw = {}) {
  const relation = toText(relationRaw).toLowerCase();
  const kind = getDrawioAnchorableKind(rowRaw);
  if (!relation || !kind) return false;
  if (kind === "text") return relation === DRAWIO_ANCHOR_RELATIONS.EXPLAINS;
  if (kind === "highlight") return relation === DRAWIO_ANCHOR_RELATIONS.HIGHLIGHTS;
  return false;
}

export function resolveDefaultDrawioAnchorRelation(rowRaw = {}) {
  const kind = getDrawioAnchorableKind(rowRaw);
  if (kind === "text") return DRAWIO_ANCHOR_RELATIONS.EXPLAINS;
  if (kind === "highlight") return DRAWIO_ANCHOR_RELATIONS.HIGHLIGHTS;
  return "";
}

function buildInvalidAnchor(anchorRaw = {}) {
  const anchor = asObject(anchorRaw);
  const out = {
    status: DRAWIO_ANCHOR_STATUSES.INVALID,
  };
  const targetKind = toText(anchor.target_kind || anchor.targetKind).toLowerCase();
  const targetId = toText(anchor.target_id || anchor.targetId);
  const relation = toText(anchor.relation).toLowerCase();
  const boundAt = toText(anchor.bound_at || anchor.boundAt);
  if (targetKind) out.target_kind = targetKind;
  if (targetId) out.target_id = targetId;
  if (relation) out.relation = relation;
  if (boundAt) out.bound_at = boundAt;
  return out;
}

export function normalizeDrawioAnchor(anchorRaw, rowRaw = {}) {
  if (anchorRaw == null || anchorRaw === false) return null;
  const anchor = asObject(anchorRaw);
  if (!Object.keys(anchor).length) return null;
  if (anchor.remove === true) return null;

  const rowKind = getDrawioAnchorableKind(rowRaw);
  const targetKind = toText(anchor.target_kind || anchor.targetKind).toLowerCase();
  const targetId = toText(anchor.target_id || anchor.targetId);
  const requestedRelation = toText(anchor.relation).toLowerCase();
  const relation = requestedRelation || resolveDefaultDrawioAnchorRelation(rowRaw);
  const boundAt = toText(anchor.bound_at || anchor.boundAt);
  const requestedStatus = toText(anchor.status).toLowerCase();

  if (!rowKind) return buildInvalidAnchor(anchor);
  if (targetKind && targetKind !== DRAWIO_ANCHOR_TARGET_KIND) return buildInvalidAnchor(anchor);
  if (!targetId) return buildInvalidAnchor(anchor);
  if (!isSupportedDrawioAnchorRelation(relation, rowRaw)) return buildInvalidAnchor(anchor);

  const out = {
    target_kind: DRAWIO_ANCHOR_TARGET_KIND,
    target_id: targetId,
    status: DRAWIO_ANCHOR_STATUSES.ANCHORED,
    relation,
  };
  if (requestedStatus === DRAWIO_ANCHOR_STATUSES.ORPHANED) {
    out.status = DRAWIO_ANCHOR_STATUSES.ORPHANED;
  } else if (requestedStatus === DRAWIO_ANCHOR_STATUSES.INVALID) {
    out.status = DRAWIO_ANCHOR_STATUSES.INVALID;
  } else if (requestedStatus === DRAWIO_ANCHOR_STATUSES.UNANCHORED) {
    return null;
  }
  if (boundAt) out.bound_at = boundAt;
  return out;
}

export function validateDrawioAnchor(anchorRaw, {
  rowRaw = {},
  bpmnNodeIds = [],
  validationReady = true,
} = {}) {
  const normalized = normalizeDrawioAnchor(anchorRaw, rowRaw);
  if (!normalized) {
    return {
      status: DRAWIO_ANCHOR_STATUSES.UNANCHORED,
      anchor: null,
    };
  }
  if (normalized.status === DRAWIO_ANCHOR_STATUSES.INVALID) {
    return {
      status: DRAWIO_ANCHOR_STATUSES.INVALID,
      anchor: normalized,
    };
  }
  if (validationReady !== true) {
    return {
      status: normalized.status || DRAWIO_ANCHOR_STATUSES.ANCHORED,
      anchor: normalized,
      validationDeferred: true,
    };
  }
  const ids = new Set(asArray(bpmnNodeIds).map((id) => toText(id)).filter(Boolean));
  if (!ids.has(toText(normalized.target_id))) {
    return {
      status: DRAWIO_ANCHOR_STATUSES.ORPHANED,
      anchor: {
        ...normalized,
        status: DRAWIO_ANCHOR_STATUSES.ORPHANED,
      },
    };
  }
  return {
    status: DRAWIO_ANCHOR_STATUSES.ANCHORED,
    anchor: {
      ...normalized,
      status: DRAWIO_ANCHOR_STATUSES.ANCHORED,
    },
  };
}

export function applyDrawioAnchorValidation(metaRaw = {}, bpmnNodeIds = [], validationReady = true) {
  const meta = asObject(metaRaw);
  const rows = asArray(meta.drawio_elements_v1);
  let changed = false;
  const nextRows = rows.map((rowRaw) => {
    const row = asObject(rowRaw);
    const validation = validateDrawioAnchor(row.anchor_v1, {
      rowRaw: row,
      bpmnNodeIds,
      validationReady,
    });
    if (!validation.anchor) {
      if (!row.anchor_v1) return row;
      changed = true;
      const next = { ...row };
      delete next.anchor_v1;
      return next;
    }
    const prevComparable = JSON.stringify(asObject(row.anchor_v1));
    const nextComparable = JSON.stringify(validation.anchor);
    if (prevComparable === nextComparable) return row;
    changed = true;
    return {
      ...row,
      anchor_v1: validation.anchor,
    };
  });
  if (!changed) return meta;
  return {
    ...meta,
    drawio_elements_v1: nextRows,
  };
}

export function collectBpmnNodeIdsFromDraft(draftRaw = {}) {
  const draft = asObject(draftRaw);
  return Array.from(
    new Set(
      asArray(draft.nodes)
        .map((nodeRaw) => toText(asObject(nodeRaw).id))
        .filter(Boolean),
    ),
  );
}

export function readDrawioAnchorValidationState(draftRaw = {}) {
  const draft = asObject(draftRaw);
  const ids = collectBpmnNodeIdsFromDraft(draft);
  const hasBpmnXml = toText(draft.bpmn_xml).length > 0;
  return {
    ids,
    ready: ids.length > 0 || !hasBpmnXml,
    hasBpmnXml,
  };
}

export function readDrawioAnchorStatus(rowRaw = {}) {
  const row = asObject(rowRaw);
  const anchor = asObject(row.anchor_v1);
  const status = toText(anchor.status || row.anchorStatus).toLowerCase();
  if (
    status === DRAWIO_ANCHOR_STATUSES.ANCHORED
    || status === DRAWIO_ANCHOR_STATUSES.ORPHANED
    || status === DRAWIO_ANCHOR_STATUSES.INVALID
  ) {
    return status;
  }
  return DRAWIO_ANCHOR_STATUSES.UNANCHORED;
}

export function formatDrawioAnchorStatusLabel(statusRaw) {
  const status = toText(statusRaw).toLowerCase();
  if (status === DRAWIO_ANCHOR_STATUSES.ANCHORED) return "anchored";
  if (status === DRAWIO_ANCHOR_STATUSES.ORPHANED) return "orphaned";
  if (status === DRAWIO_ANCHOR_STATUSES.INVALID) return "invalid";
  return "freeform";
}

export function summarizeDrawioAnchorStatuses(rowsRaw = []) {
  return asArray(rowsRaw).reduce((acc, rowRaw) => {
    const status = readDrawioAnchorStatus(rowRaw);
    acc.total += 1;
    acc[status] = Number(acc[status] || 0) + 1;
    return acc;
  }, {
    total: 0,
    anchored: 0,
    unanchored: 0,
    orphaned: 0,
    invalid: 0,
  });
}

export function describeDrawioAnchor(rowRaw = {}, options = {}) {
  const row = asObject(rowRaw);
  const anchor = asObject(row.anchor_v1);
  const status = readDrawioAnchorStatus(row);
  const targetId = toText(anchor.target_id);
  const validationDeferred = options.validationDeferred === true;
  const eligible = isDrawioAnchorableRow(row);
  if (status === DRAWIO_ANCHOR_STATUSES.ANCHORED) {
    return {
      status,
      statusLabel: formatDrawioAnchorStatusLabel(status),
      targetId,
      canJump: !validationDeferred && !!targetId,
      issueText: validationDeferred
        ? "Проверка BPMN target ещё не завершена; сохранён last-known anchor."
        : `Привязано к BPMN node ${targetId}.`,
      recoveryText: "Можно перейти к target, сделать freeform или перепривязать к выбранному BPMN узлу.",
    };
  }
  if (status === DRAWIO_ANCHOR_STATUSES.ORPHANED) {
    return {
      status,
      statusLabel: formatDrawioAnchorStatusLabel(status),
      targetId,
      canJump: false,
      issueText: targetId
        ? `BPMN node ${targetId} отсутствует в текущем session BPMN.`
        : "BPMN target отсутствует в текущем session BPMN.",
      recoveryText: "Можно сделать freeform или перепривязать к выбранному BPMN узлу.",
    };
  }
  if (status === DRAWIO_ANCHOR_STATUSES.INVALID) {
    return {
      status,
      statusLabel: formatDrawioAnchorStatusLabel(status),
      targetId,
      canJump: false,
      issueText: "Anchor metadata нарушает pilot contract и не считается valid binding.",
      recoveryText: "Можно сделать freeform или создать новый valid anchor к выбранному BPMN узлу.",
    };
  }
  return {
    status,
    statusLabel: formatDrawioAnchorStatusLabel(status),
    targetId,
    canJump: false,
    issueText: eligible
      ? "Объект остаётся freeform, пока вы явно не привяжете его к BPMN node."
      : "Этот объект остаётся freeform: первый pilot якорит только text и rect/container runtime classes.",
    recoveryText: eligible
      ? "Можно привязать к выбранному BPMN узлу."
      : "Для этого surface anchor authoring не включён.",
  };
}

export function buildDrawioAnchorImportDiagnostics({
  beforeMeta = {},
  beforeBpmnNodeIds = [],
  afterBpmnNodeIds = [],
  validationReady = true,
} = {}) {
  if (validationReady !== true) {
    return {
      importHasAnchorImpact: false,
      validationDeferred: true,
      totalAnchoredBefore: 0,
      totalAnchoredAfter: 0,
      preservedAnchoredCount: 0,
      orphanedCountAfterImport: 0,
      invalidCountAfterImport: 0,
      affectedObjectIds: [],
      affectedTargetIds: [],
      severity: "pending",
    };
  }
  const beforeValidated = applyDrawioAnchorValidation(beforeMeta, beforeBpmnNodeIds, true);
  const afterValidated = applyDrawioAnchorValidation(beforeMeta, afterBpmnNodeIds, true);
  const beforeRows = asArray(beforeValidated.drawio_elements_v1);
  const afterRows = asArray(afterValidated.drawio_elements_v1);
  const beforeById = new Map(beforeRows.map((row) => [toText(asObject(row).id), asObject(row)]));
  const afterById = new Map(afterRows.map((row) => [toText(asObject(row).id), asObject(row)]));
  let totalAnchoredBefore = 0;
  let totalAnchoredAfter = 0;
  let orphanedCountAfterImport = 0;
  let invalidCountAfterImport = 0;
  let preservedAnchoredCount = 0;
  const affectedObjectIds = [];
  const affectedTargetIds = new Set();

  afterRows.forEach((row) => {
    const id = toText(row.id);
    const beforeRow = asObject(beforeById.get(id));
    const beforeStatus = readDrawioAnchorStatus(beforeRow);
    const afterStatus = readDrawioAnchorStatus(row);
    if (beforeStatus === DRAWIO_ANCHOR_STATUSES.ANCHORED) totalAnchoredBefore += 1;
    if (afterStatus === DRAWIO_ANCHOR_STATUSES.ANCHORED) totalAnchoredAfter += 1;
    if (afterStatus === DRAWIO_ANCHOR_STATUSES.ORPHANED) orphanedCountAfterImport += 1;
    if (afterStatus === DRAWIO_ANCHOR_STATUSES.INVALID) invalidCountAfterImport += 1;
    if (beforeStatus === DRAWIO_ANCHOR_STATUSES.ANCHORED && afterStatus === DRAWIO_ANCHOR_STATUSES.ANCHORED) {
      preservedAnchoredCount += 1;
    }
    const impacted = (
      (beforeStatus === DRAWIO_ANCHOR_STATUSES.ANCHORED && afterStatus !== DRAWIO_ANCHOR_STATUSES.ANCHORED)
      || (beforeStatus !== afterStatus && afterStatus === DRAWIO_ANCHOR_STATUSES.INVALID)
    );
    if (impacted) {
      affectedObjectIds.push(id);
      const targetId = toText(asObject(row.anchor_v1).target_id || asObject(beforeRow.anchor_v1).target_id);
      if (targetId) affectedTargetIds.add(targetId);
    }
  });

  const importHasAnchorImpact = affectedObjectIds.length > 0;
  const severity = invalidCountAfterImport > 0 || orphanedCountAfterImport > 0
    ? "warning"
    : "ok";
  return {
    importHasAnchorImpact,
    validationDeferred: false,
    totalAnchoredBefore,
    totalAnchoredAfter,
    preservedAnchoredCount,
    orphanedCountAfterImport,
    invalidCountAfterImport,
    affectedObjectIds,
    affectedTargetIds: Array.from(affectedTargetIds),
    severity,
  };
}

export function buildBpmnNodeOverlayCompanionSummary({
  selectedBpmnNodeId = "",
  drawioMeta = {},
  bpmnNodeIds = [],
  validationReady = true,
} = {}) {
  const nodeId = toText(selectedBpmnNodeId);
  const deferred = validationReady !== true;
  if (!nodeId) {
    return {
      nodeId: "",
      hasOverlayCompanions: false,
      companionCount: 0,
      companionObjectIds: [],
      companionKindsSummary: { text: 0, highlight: 0 },
      companionStatusSummary: { anchored: 0, invalid: 0 },
      hasIssues: false,
      issueCounts: { invalid: 0 },
      healthyCount: 0,
      invalidCount: 0,
      summaryTone: "neutral",
      canJumpToOverlay: false,
      companions: [],
      previewCompanions: [],
      hasMoreCompanions: false,
      remainingCompanionCount: 0,
      validationDeferred: deferred,
    };
  }
  if (deferred) {
    return {
      nodeId,
      hasOverlayCompanions: false,
      companionCount: 0,
      companionObjectIds: [],
      companionKindsSummary: { text: 0, highlight: 0 },
      companionStatusSummary: { anchored: 0, invalid: 0 },
      hasIssues: false,
      issueCounts: { invalid: 0 },
      healthyCount: 0,
      invalidCount: 0,
      summaryTone: "pending",
      canJumpToOverlay: false,
      companions: [],
      previewCompanions: [],
      hasMoreCompanions: false,
      remainingCompanionCount: 0,
      validationDeferred: true,
    };
  }

  const validatedMeta = applyDrawioAnchorValidation(drawioMeta, bpmnNodeIds, validationReady);
  const rows = asArray(validatedMeta.drawio_elements_v1);
  const companions = [];
  const kinds = { text: 0, highlight: 0 };
  const statuses = { anchored: 0, invalid: 0 };
  const issues = { invalid: 0 };

  rows.forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const anchor = asObject(row.anchor_v1);
    const targetId = toText(anchor.target_id);
    if (!targetId || targetId !== nodeId) return;
    const status = readDrawioAnchorStatus(row);
    if (
      status !== DRAWIO_ANCHOR_STATUSES.ANCHORED
      && status !== DRAWIO_ANCHOR_STATUSES.INVALID
    ) {
      return;
    }
    const kind = getDrawioAnchorableKind(row) || "other";
    if (kind === "text" || kind === "highlight") {
      kinds[kind] += 1;
    }
    statuses[status] += 1;
    if (status === DRAWIO_ANCHOR_STATUSES.INVALID) {
      issues.invalid += 1;
    }
    companions.push({
      objectId: toText(row.id),
      kind,
      relation: toText(anchor.relation),
      status,
      statusLabel: formatDrawioAnchorStatusLabel(status),
      targetId,
      canJump: status === DRAWIO_ANCHOR_STATUSES.ANCHORED,
      text: toText(row.text || row.label),
    });
  });

  const sortedCompanions = companions.slice().sort((a, b) => {
    const statusRankA = a.status === DRAWIO_ANCHOR_STATUSES.INVALID ? 0 : 1;
    const statusRankB = b.status === DRAWIO_ANCHOR_STATUSES.INVALID ? 0 : 1;
    if (statusRankA !== statusRankB) return statusRankA - statusRankB;
    const kindRankA = a.kind === "text" ? 0 : (a.kind === "highlight" ? 1 : 2);
    const kindRankB = b.kind === "text" ? 0 : (b.kind === "highlight" ? 1 : 2);
    if (kindRankA !== kindRankB) return kindRankA - kindRankB;
    const textCmp = compareText(a.text || a.objectId, b.text || b.objectId);
    if (textCmp !== 0) return textCmp;
    return compareText(a.objectId, b.objectId);
  });
  const previewLimit = 3;
  const previewCompanions = sortedCompanions.slice(0, previewLimit);
  const remainingCompanionCount = Math.max(0, sortedCompanions.length - previewCompanions.length);
  const invalidCount = issues.invalid;
  const healthyCount = statuses.anchored;

  return {
    nodeId,
    hasOverlayCompanions: sortedCompanions.length > 0,
    companionCount: sortedCompanions.length,
    companionObjectIds: sortedCompanions.map((item) => item.objectId).filter(Boolean),
    companionKindsSummary: kinds,
    companionStatusSummary: statuses,
    hasIssues: invalidCount > 0,
    issueCounts: issues,
    healthyCount,
    invalidCount,
    summaryTone: invalidCount > 0 ? "warning" : (sortedCompanions.length > 0 ? "ok" : "neutral"),
    canJumpToOverlay: sortedCompanions.some((item) => item.canJump),
    companions: sortedCompanions,
    previewCompanions,
    hasMoreCompanions: remainingCompanionCount > 0,
    remainingCompanionCount,
    validationDeferred: false,
  };
}
