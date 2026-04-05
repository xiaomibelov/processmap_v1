import { useCallback, useEffect, useMemo, useState } from "react";
import { isBpmnDiagramContextMenuBlocked } from "./bpmnDiagramContextMenuBlockState.js";

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useBpmnSubprocessPreview({
  bpmnRef,
  hasSession,
  tab,
  drawioEditorOpen,
  hybridPlacementHitLayerActive,
  hybridModeEffective,
  setInfoMsg,
  setGenErr,
} = {}) {
  const isBlocked = useMemo(() => {
    return isBpmnDiagramContextMenuBlocked({
      hasSession,
      tab,
      drawioEditorOpen,
      hybridPlacementHitLayerActive,
      hybridModeEffective,
    });
  }, [
    drawioEditorOpen,
    hasSession,
    hybridModeEffective,
    hybridPlacementHitLayerActive,
    tab,
  ]);

  const [bpmnSubprocessPreview, setBpmnSubprocessPreview] = useState(null);

  const closeBpmnSubprocessPreview = useCallback(() => {
    setBpmnSubprocessPreview(null);
  }, []);

  const handleBpmnContextActionResult = useCallback((resultRaw, {
    menuTarget = null,
    closeContextMenu,
  } = {}) => {
    const result = asObject(resultRaw);
    const previewRaw = result?.openInsidePreview;
    if (!previewRaw || typeof previewRaw !== "object") return false;
    const preview = asObject(previewRaw);
    setBpmnSubprocessPreview({
      ...preview,
      targetId: toText(preview.targetId || asObject(menuTarget).id),
    });
    closeContextMenu?.();
    return true;
  }, []);

  const openBpmnSubprocessPreviewProperties = useCallback(async () => {
    const preview = asObject(bpmnSubprocessPreview);
    const targetId = toText(preview.targetId);
    if (!targetId) return { ok: false, error: "preview_target_missing" };

    let result = null;
    try {
      result = await Promise.resolve(
        bpmnRef?.current?.runDiagramContextAction?.({
          actionId: "open_properties",
          target: { id: targetId, kind: "element" },
          clientX: Number(preview.clientX || 0),
          clientY: Number(preview.clientY || 0),
          value: "",
        }),
      );
    } catch (error) {
      result = { ok: false, error: String(error?.message || error || "context_action_failed") };
    }

    if (!result?.ok) {
      setGenErr?.(toText(result?.error || "Не удалось открыть свойства подпроцесса."));
      return result;
    }

    setBpmnSubprocessPreview(null);
    if (toText(result?.message)) setInfoMsg?.(toText(result.message));
    return result;
  }, [bpmnRef, bpmnSubprocessPreview, setGenErr, setInfoMsg]);

  useEffect(() => {
    if (!isBlocked) return;
    setBpmnSubprocessPreview(null);
  }, [isBlocked]);

  return {
    bpmnSubprocessPreview,
    closeBpmnSubprocessPreview,
    openBpmnSubprocessPreviewProperties,
    handleBpmnContextActionResult,
  };
}
