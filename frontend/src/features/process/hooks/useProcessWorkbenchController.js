import { useMemo } from "react";
import {
  PROCESS_WORKBENCH_CONFIG,
  normalizeWorkbenchTab,
  getGenerateTooltip,
} from "../processWorkbench.config";

export default function useProcessWorkbenchController({
  sessionId,
  isLocal,
  locked,
  tab,
  isInterview,
  isBpmnTab,
  genBusy,
  aiStepBusy,
}) {
  const sid = String(sessionId || "").trim();
  const hasSession = !!sid;
  const normalizedTab = normalizeWorkbenchTab(tab);
  const canGenerate = hasSession && !isLocal && !locked && !genBusy;
  const generateTooltip = getGenerateTooltip({ isLocal, locked });
  const generateLabel = genBusy
    ? PROCESS_WORKBENCH_CONFIG.labels.generating
    : PROCESS_WORKBENCH_CONFIG.labels.generate;
  const saveTooltip = !isBpmnTab
    ? PROCESS_WORKBENCH_CONFIG.tooltips.saveDisabled
    : (isLocal
      ? PROCESS_WORKBENCH_CONFIG.tooltips.saveLocal
      : PROCESS_WORKBENCH_CONFIG.tooltips.saveBackend);
  const importTooltip = !hasSession
    ? PROCESS_WORKBENCH_CONFIG.tooltips.importNoSession
    : (!isBpmnTab
      ? PROCESS_WORKBENCH_CONFIG.tooltips.importInterview
      : PROCESS_WORKBENCH_CONFIG.tooltips.importReady);
  const clearTooltip = isLocal
    ? PROCESS_WORKBENCH_CONFIG.tooltips.clearLocal
    : PROCESS_WORKBENCH_CONFIG.tooltips.clearBackend;
  const aiTooltip = isInterview
    ? PROCESS_WORKBENCH_CONFIG.tooltips.aiInterview
    : (isLocal
      ? PROCESS_WORKBENCH_CONFIG.tooltips.aiLocal
      : PROCESS_WORKBENCH_CONFIG.tooltips.aiBackend);
  const aiLabel = aiStepBusy ? "…" : PROCESS_WORKBENCH_CONFIG.labels.ai;
  const tabs = PROCESS_WORKBENCH_CONFIG.tabs;
  const emptyGuide = PROCESS_WORKBENCH_CONFIG.emptyGuide;
  const labels = PROCESS_WORKBENCH_CONFIG.labels;

  return useMemo(
    () => ({
      hasSession,
      tab: normalizedTab,
      tabs,
      emptyGuide,
      labels,
      canGenerate,
      generateLabel,
      generateTooltip,
      saveTooltip,
      importTooltip,
      clearTooltip,
      aiTooltip,
      aiLabel,
    }),
    [
      hasSession,
      normalizedTab,
      tabs,
      emptyGuide,
      labels,
      canGenerate,
      generateLabel,
      generateTooltip,
      saveTooltip,
      importTooltip,
      clearTooltip,
      aiTooltip,
      aiLabel,
    ],
  );
}
