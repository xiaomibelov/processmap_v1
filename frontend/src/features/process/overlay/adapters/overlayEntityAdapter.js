import { OVERLAY_ENTITY_KINDS } from "../../drawio/domain/drawioEntityKinds.js";
import {
  describeDrawioAnchor,
} from "../../drawio/drawioAnchors.js";
import {
  deriveSelectedDrawioElementId,
  getDrawioElementById,
  getDrawioElements,
} from "../../drawio/domain/drawioSelectors.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toReadableLabel(raw) {
  const row = asObject(raw);
  return toText(row.label || row.text || row.name || row.title || row.id) || toText(row.id);
}

function buildDrawioAnchorUi(raw, options = {}) {
  const row = asObject(raw);
  const described = describeDrawioAnchor(row, {
    validationDeferred: options.validationDeferred === true,
  });
  const anchor = asObject(row.anchor_v1);
  return {
    anchorStatus: described.status,
    anchorStatusLabel: described.statusLabel,
    anchorTargetId: described.targetId,
    anchorRelation: toText(anchor.relation),
    anchorIssueText: toText(described.issueText),
    anchorRecoveryText: toText(described.recoveryText),
    anchorCanJump: described.canJump === true,
  };
}

export function buildOverlayEntityRows({
  drawioState,
  hybridLayerRenderRows,
  hybridV2Renderable,
  hybridV2BindingByHybridId,
} = {}) {
  const rows = [];
  const legacyRows = asArray(hybridLayerRenderRows);
  const v2Elements = asArray(asObject(hybridV2Renderable).elements);
  const drawioRows = getDrawioElements(drawioState, { renderableOnly: true }).slice(0, 40);

  drawioRows.forEach((row) => {
    const id = toText(row.id);
    if (!id) return;
    rows.push({
      key: `drawio_${id}`,
      entityKind: OVERLAY_ENTITY_KINDS.DRAWIO,
      entityId: id,
      label: toReadableLabel(row),
      subtitle: `${id}${toText(row.layer_id) ? ` · ${toText(row.layer_id)}` : ""}`,
      layer_id: toText(row.layer_id),
      missing: false,
      ...buildDrawioAnchorUi(row, {
        validationDeferred: asObject(drawioState)._anchor_validation_deferred === true,
      }),
    });
  });
  v2Elements.slice(0, 60).forEach((elementRaw) => {
    const element = asObject(elementRaw);
    const elementId = toText(element.id);
    if (!elementId) return;
    const binding = asObject(asObject(hybridV2BindingByHybridId)[elementId]);
    rows.push({
      key: `hybrid_${elementId}`,
      entityKind: OVERLAY_ENTITY_KINDS.HYBRID,
      entityId: elementId,
      label: toReadableLabel(element),
      subtitle: elementId,
      missing: !toText(binding.bpmn_id || binding.bpmnId),
    });
  });
  legacyRows.slice(0, 40).forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const elementId = toText(row.elementId);
    if (!elementId) return;
    rows.push({
      key: `legacy_${elementId}`,
      entityKind: OVERLAY_ENTITY_KINDS.LEGACY,
      entityId: elementId,
      label: toText(row.title || elementId) || elementId,
      subtitle: elementId,
      missing: !row.hasCenter,
    });
  });
  return rows;
}

export function buildOverlaySelectedEntity({
  drawioState,
  drawioSelectedElementId,
  hybridV2ActiveId,
  hybridV2SelectedIds,
  legacyActiveElementId,
  hybridV2Renderable,
} = {}) {
  const selectedHybridIds = Array.from(
    new Set(asArray(hybridV2SelectedIds).map((row) => toText(row)).filter(Boolean)),
  );
  if (selectedHybridIds.length > 1) {
    return {
      entityKind: OVERLAY_ENTITY_KINDS.HYBRID,
      entityIds: selectedHybridIds,
      entityId: toText(hybridV2ActiveId) || selectedHybridIds[0],
      label: `${selectedHybridIds.length} шт.`,
      multi: true,
    };
  }
  if (selectedHybridIds.length === 1) {
    const entityId = selectedHybridIds[0];
    const hybridElement = asObject(
      asArray(asObject(hybridV2Renderable).elements).find((rowRaw) => toText(asObject(rowRaw).id) === entityId),
    );
    return {
      entityKind: OVERLAY_ENTITY_KINDS.HYBRID,
      entityId,
      entityIds: [entityId],
      label: toReadableLabel(hybridElement) || entityId,
      multi: false,
    };
  }

  const canonicalDrawioId = deriveSelectedDrawioElementId({
    drawioMeta: drawioState,
    selectedDrawioElementId: drawioSelectedElementId,
    requireRenderable: true,
    allowLegacyFallback: false,
    legacyActiveElementId,
  });
  if (canonicalDrawioId) {
    const row = asObject(getDrawioElementById(drawioState, canonicalDrawioId));
    return {
      entityKind: OVERLAY_ENTITY_KINDS.DRAWIO,
      entityId: canonicalDrawioId,
      entityIds: [canonicalDrawioId],
      label: toReadableLabel(row) || canonicalDrawioId,
      layer_id: toText(row.layer_id),
      multi: false,
      ...buildDrawioAnchorUi(row, {
        validationDeferred: asObject(drawioState)._anchor_validation_deferred === true,
      }),
    };
  }

  const legacyId = toText(legacyActiveElementId);
  if (legacyId) {
    return {
      entityKind: OVERLAY_ENTITY_KINDS.LEGACY,
      entityId: legacyId,
      entityIds: [legacyId],
      label: legacyId,
      multi: false,
    };
  }

  return {
    entityKind: "",
    entityId: "",
    entityIds: [],
    label: "—",
    multi: false,
  };
}
