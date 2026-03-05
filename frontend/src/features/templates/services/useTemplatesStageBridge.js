import { useCallback, useMemo } from "react";
import { applyTemplateToDiagram } from "./applyTemplateToDiagram";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

export default function useTemplatesStageBridge({
  selectedBpmnElement,
  draftNodes,
  sessionId,
  bpmnApiRef,
}) {
  const selectedElementId = toText(selectedBpmnElement?.id);
  const selectedElementName = toText(selectedBpmnElement?.name || selectedElementId);
  const selectedElementType = toText(selectedBpmnElement?.type);
  const selectedElementLaneName = toText(selectedBpmnElement?.laneName);

  const selectedBpmnIds = useMemo(() => {
    const ids = new Set(
      asArray(selectedBpmnElement?.selectedIds)
        .map((row) => toText(row))
        .filter(Boolean),
    );
    if (selectedElementId) ids.add(selectedElementId);
    return Array.from(ids);
  }, [selectedBpmnElement?.selectedIds, selectedElementId]);

  const selectionNodes = useMemo(() => {
    if (!selectedBpmnIds.length) return [];
    const byId = new Set(selectedBpmnIds);
    return asArray(draftNodes).filter((node) => byId.has(toText(node?.id)));
  }, [draftNodes, selectedBpmnIds]);

  const selectionContext = useMemo(() => ({
    name: selectedElementName || selectedElementId,
    primaryName: selectedElementName || selectedElementId,
    primaryElementId: selectedElementId,
    sourceSessionId: toText(sessionId),
    elementTypes: Array.from(new Set([
      ...selectionNodes.map((node) => toText(node?.type)).filter(Boolean),
      selectedElementType,
    ].filter(Boolean))),
    laneNames: Array.from(new Set([
      ...selectionNodes
        .map((node) => toText(node?.laneName || node?.lane_name || node?.lane || node?.role || node?.area))
        .filter(Boolean),
      selectedElementLaneName,
    ].filter(Boolean))),
  }), [
    selectedElementId,
    selectedElementLaneName,
    selectedElementName,
    selectedElementType,
    selectionNodes,
    sessionId,
  ]);

  const getSelectedBpmnIds = useCallback(() => selectedBpmnIds, [selectedBpmnIds]);

  const applyBpmnSelection = useCallback(async (idsRaw, options = {}) => applyTemplateToDiagram(
    bpmnApiRef?.current,
    idsRaw,
    {
      label: "Template",
      ...options,
    },
  ), [bpmnApiRef]);

  return {
    selectedBpmnIds,
    selectionContext,
    getSelectedBpmnIds,
    applyBpmnSelection,
  };
}
