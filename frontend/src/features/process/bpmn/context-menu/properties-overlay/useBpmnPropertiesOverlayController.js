import { useCallback, useEffect, useMemo, useState } from "react";
import buildBpmnPropertiesOverlaySchema from "./buildBpmnPropertiesOverlaySchema.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function normalizeDocumentationRows(rawRows) {
  return asArray(rawRows)
    .map((rowRaw) => {
      const row = asObject(rowRaw);
      const text = String(
        Object.prototype.hasOwnProperty.call(row, "text")
          ? row.text
          : (Object.prototype.hasOwnProperty.call(row, "value") ? row.value : rowRaw),
      );
      const textFormat = toText(row?.textFormat || row?.textformat);
      if (!text.trim() && !textFormat) return null;
      return { text, textFormat };
    })
    .filter(Boolean);
}

function buildDocumentationSaveRows(rowRaw, value) {
  const row = asObject(rowRaw);
  const existingRows = normalizeDocumentationRows(row?.documentationRows);
  if (!existingRows.length) {
    return [{ text: String(value ?? "") }];
  }
  return existingRows.map((entry, index) => (
    index === 0
      ? { ...entry, text: String(value ?? "") }
      : { ...entry }
  ));
}

function buildRowValueMap(schemaRaw) {
  const schema = asObject(schemaRaw);
  const out = {};
  asArray(schema.sections).forEach((section) => {
    asArray(section?.rows).forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const rowId = toText(row?.id);
      if (!rowId) return;
      out[rowId] = String(row?.value ?? "");
    });
  });
  return out;
}

function buildRowByIdMap(schemaRaw) {
  const schema = asObject(schemaRaw);
  const out = {};
  asArray(schema.sections).forEach((section) => {
    asArray(section?.rows).forEach((rowRaw) => {
      const row = asObject(rowRaw);
      const rowId = toText(row?.id);
      if (!rowId) return;
      out[rowId] = row;
    });
  });
  return out;
}

function buildSaveActionPayload({ rowRaw, value, elementId }) {
  const row = asObject(rowRaw);
  const kind = toText(row?.kind).toLowerCase();
  const target = { id: toText(elementId) };

  if (kind === "name") {
    return {
      actionId: "properties_overlay_update_name",
      elementId: toText(elementId),
      target,
      value,
    };
  }

  if (kind === "documentation") {
    return {
      actionId: "properties_overlay_update_documentation",
      elementId: toText(elementId),
      target,
      documentation: buildDocumentationSaveRows(row, value),
    };
  }

  if (kind === "extension") {
    return {
      actionId: "properties_overlay_update_extension_property",
      elementId: toText(elementId),
      target,
      propertyName: toText(row?.propertyName),
      propertyKey: toText(row?.propertyKey),
      value,
    };
  }

  return null;
}

export default function useBpmnPropertiesOverlayController({
  bpmnRef,
  setGenErr,
  setInfoMsg,
} = {}) {
  const [overlayPayload, setOverlayPayload] = useState(null);
  const [overlayTarget, setOverlayTarget] = useState(null);
  const [open, setOpen] = useState(false);
  const [savingRowId, setSavingRowId] = useState("");
  const [error, setError] = useState("");
  const [draftByRowId, setDraftByRowId] = useState({});
  const [savedByRowId, setSavedByRowId] = useState({});

  const schema = useMemo(() => {
    if (!open || !overlayPayload) return null;
    return buildBpmnPropertiesOverlaySchema({
      payloadRaw: overlayPayload,
      targetRaw: overlayTarget,
    });
  }, [open, overlayPayload, overlayTarget]);

  const rowById = useMemo(() => buildRowByIdMap(schema), [schema]);

  useEffect(() => {
    if (!schema) {
      setDraftByRowId({});
      setSavedByRowId({});
      return;
    }
    const next = buildRowValueMap(schema);
    setDraftByRowId(next);
    setSavedByRowId(next);
  }, [schema]);

  const closeOverlay = useCallback(() => {
    setOpen(false);
    setOverlayPayload(null);
    setOverlayTarget(null);
    setSavingRowId("");
    setError("");
    setDraftByRowId({});
    setSavedByRowId({});
  }, []);

  const handleContextMenuActionResult = useCallback((eventRaw = {}) => {
    const event = asObject(eventRaw);
    if (toText(event?.actionId) !== "open_properties") return;
    const result = asObject(event?.result);
    const payload = asObject(result?.openPropertiesOverlay);
    if (!toText(payload?.elementId)) return;
    setOverlayPayload(payload);
    setOverlayTarget(asObject(event?.menu?.target));
    setSavingRowId("");
    setError("");
    setOpen(true);
  }, []);

  const setDraftValue = useCallback((rowIdRaw, valueRaw) => {
    const rowId = toText(rowIdRaw);
    if (!rowId) return;
    setDraftByRowId((prev) => ({
      ...asObject(prev),
      [rowId]: String(valueRaw ?? ""),
    }));
  }, []);

  const cancelRowEdit = useCallback((rowIdRaw) => {
    const rowId = toText(rowIdRaw);
    if (!rowId) return;
    setDraftByRowId((prev) => ({
      ...asObject(prev),
      [rowId]: String(asObject(savedByRowId)[rowId] ?? ""),
    }));
  }, [savedByRowId]);

  const submitRowValue = useCallback(async (rowIdRaw, valueRaw) => {
    const rowId = toText(rowIdRaw);
    if (!rowId || !schema) return { ok: false, error: "row_missing" };
    const row = asObject(rowById[rowId]);
    if (row?.editable !== true) return { ok: false, error: "row_read_only" };

    const nextValue = String(valueRaw ?? "");
    const saved = String(asObject(savedByRowId)[rowId] ?? "");
    if (nextValue === saved) return { ok: true, skipped: true };

    const payload = buildSaveActionPayload({
      rowRaw: row,
      value: nextValue,
      elementId: schema.elementId,
    });
    if (!payload) return { ok: false, error: "unsupported_row" };

    setSavingRowId(rowId);
    setError("");

    let result = null;
    try {
      result = await Promise.resolve(bpmnRef?.current?.runDiagramContextAction?.(payload));
    } catch (runError) {
      result = { ok: false, error: String(runError?.message || runError || "properties_overlay_save_failed") };
    }

    if (!result?.ok) {
      const err = toText(result?.error || "Не удалось сохранить свойство.");
      setError(err);
      setGenErr?.(err);
      setSavingRowId("");
      return { ok: false, error: err };
    }

    const refreshedPayload = asObject(result?.openPropertiesOverlay);
    if (toText(refreshedPayload?.elementId)) {
      setOverlayPayload(refreshedPayload);
    } else {
      setSavedByRowId((prev) => ({ ...asObject(prev), [rowId]: nextValue }));
      setDraftByRowId((prev) => ({ ...asObject(prev), [rowId]: nextValue }));
    }

    if (toText(result?.message)) {
      setInfoMsg?.(toText(result.message));
    }

    setSavingRowId("");
    return { ok: true };
  }, [bpmnRef, rowById, savedByRowId, schema, setGenErr, setInfoMsg]);

  return {
    isOpen: open,
    schema,
    draftByRowId,
    savingRowId,
    error,
    closeOverlay,
    setDraftValue,
    cancelRowEdit,
    submitRowValue,
    handleContextMenuActionResult,
  };
}
