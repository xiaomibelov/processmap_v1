import { useCallback, useState } from "react";

function getDefaultAttentionFilters() {
  return {
    quality: false,
    ai: false,
    notes: false,
  };
}

function getDefaultRobotMetaOverlayFilters() {
  return {
    ready: true,
    incomplete: true,
  };
}

function getDefaultQualityOverlayFilters() {
  return {
    orphan: false,
    dead_end: false,
    gateway: false,
    link_errors: false,
    missing_duration: false,
    missing_notes: false,
    route_truncated: false,
  };
}

export default function useProcessStagePanelState() {
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const [saveDirtyHint, setSaveDirtyHint] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [attentionFilters, setAttentionFilters] = useState(getDefaultAttentionFilters);
  const [attentionMarkerMessage, setAttentionMarkerMessage] = useState("");
  const [attentionMarkerSaving, setAttentionMarkerSaving] = useState(false);
  const [attentionSessionLastOpenedAt, setAttentionSessionLastOpenedAt] = useState(0);
  const [diagramActionPathOpen, setDiagramActionPathOpen] = useState(false);
  const [diagramActionHybridToolsOpen, setDiagramActionHybridToolsOpen] = useState(false);
  const [diagramActionPlanOpen, setDiagramActionPlanOpen] = useState(false);
  const [diagramActionPlaybackOpen, setDiagramActionPlaybackOpen] = useState(false);
  const [diagramActionLayersOpen, setDiagramActionLayersOpen] = useState(false);
  const [diagramActionRobotMetaOpen, setDiagramActionRobotMetaOpen] = useState(false);
  const [diagramActionQualityOpen, setDiagramActionQualityOpen] = useState(false);
  const [diagramActionSearchOpen, setDiagramActionSearchOpen] = useState(false);
  const [diagramActionOverflowOpen, setDiagramActionOverflowOpen] = useState(false);
  const [drawioSelectedElementId, setDrawioSelectedElementId] = useState("");
  const [pathHighlightEnabled, setPathHighlightEnabled] = useState(false);
  const [pathHighlightTier, setPathHighlightTier] = useState("P0");
  const [pathHighlightSequenceKey, setPathHighlightSequenceKey] = useState("");
  const [robotMetaOverlayEnabled, setRobotMetaOverlayEnabled] = useState(false);
  const [robotMetaOverlayFilters, setRobotMetaOverlayFilters] = useState(getDefaultRobotMetaOverlayFilters);
  const [robotMetaListOpen, setRobotMetaListOpen] = useState(false);
  const [robotMetaListTab, setRobotMetaListTab] = useState("ready");
  const [robotMetaListSearch, setRobotMetaListSearch] = useState("");
  const [qualityOverlayFilters, setQualityOverlayFilters] = useState(getDefaultQualityOverlayFilters);
  const [qualityOverlayListKey, setQualityOverlayListKey] = useState("");
  const [qualityOverlaySearch, setQualityOverlaySearch] = useState("");
  const [diagramPathsIntent, setDiagramPathsIntent] = useState(null);
  const [executionPlanPreview, setExecutionPlanPreview] = useState(null);
  const [executionPlanBusy, setExecutionPlanBusy] = useState(false);
  const [executionPlanSaveBusy, setExecutionPlanSaveBusy] = useState(false);
  const [executionPlanError, setExecutionPlanError] = useState("");

  const resetPanelsForSession = useCallback(() => {
    setToolbarMenuOpen(false);
    setSaveDirtyHint(false);
    setAttentionOpen(false);
    setAttentionFilters(getDefaultAttentionFilters());
    setAttentionMarkerMessage("");
    setAttentionMarkerSaving(false);
    setAttentionSessionLastOpenedAt(0);
    setDiagramActionPathOpen(false);
    setDiagramActionHybridToolsOpen(false);
    setDiagramActionPlanOpen(false);
    setDiagramActionPlaybackOpen(false);
    setDiagramActionLayersOpen(false);
    setDiagramActionRobotMetaOpen(false);
    setDiagramActionQualityOpen(false);
    setDiagramActionSearchOpen(false);
    setDiagramActionOverflowOpen(false);
    setDrawioSelectedElementId("");
    setPathHighlightEnabled(false);
    setPathHighlightTier("P0");
    setPathHighlightSequenceKey("");
    setRobotMetaOverlayEnabled(false);
    setRobotMetaOverlayFilters(getDefaultRobotMetaOverlayFilters());
    setRobotMetaListOpen(false);
    setRobotMetaListTab("ready");
    setRobotMetaListSearch("");
    setQualityOverlayFilters(getDefaultQualityOverlayFilters());
    setQualityOverlayListKey("");
    setQualityOverlaySearch("");
    setDiagramPathsIntent(null);
    setExecutionPlanPreview(null);
    setExecutionPlanBusy(false);
    setExecutionPlanSaveBusy(false);
    setExecutionPlanError("");
  }, []);

  return {
    toolbarMenuOpen,
    setToolbarMenuOpen,
    saveDirtyHint,
    setSaveDirtyHint,
    attentionOpen,
    setAttentionOpen,
    attentionFilters,
    setAttentionFilters,
    attentionMarkerMessage,
    setAttentionMarkerMessage,
    attentionMarkerSaving,
    setAttentionMarkerSaving,
    attentionSessionLastOpenedAt,
    setAttentionSessionLastOpenedAt,
    diagramActionPathOpen,
    setDiagramActionPathOpen,
    diagramActionHybridToolsOpen,
    setDiagramActionHybridToolsOpen,
    diagramActionPlanOpen,
    setDiagramActionPlanOpen,
    diagramActionPlaybackOpen,
    setDiagramActionPlaybackOpen,
    diagramActionLayersOpen,
    setDiagramActionLayersOpen,
    diagramActionRobotMetaOpen,
    setDiagramActionRobotMetaOpen,
    diagramActionQualityOpen,
    setDiagramActionQualityOpen,
    diagramActionSearchOpen,
    setDiagramActionSearchOpen,
    diagramActionOverflowOpen,
    setDiagramActionOverflowOpen,
    drawioSelectedElementId,
    setDrawioSelectedElementId,
    pathHighlightEnabled,
    setPathHighlightEnabled,
    pathHighlightTier,
    setPathHighlightTier,
    pathHighlightSequenceKey,
    setPathHighlightSequenceKey,
    robotMetaOverlayEnabled,
    setRobotMetaOverlayEnabled,
    robotMetaOverlayFilters,
    setRobotMetaOverlayFilters,
    robotMetaListOpen,
    setRobotMetaListOpen,
    robotMetaListTab,
    setRobotMetaListTab,
    robotMetaListSearch,
    setRobotMetaListSearch,
    qualityOverlayFilters,
    setQualityOverlayFilters,
    qualityOverlayListKey,
    setQualityOverlayListKey,
    qualityOverlaySearch,
    setQualityOverlaySearch,
    diagramPathsIntent,
    setDiagramPathsIntent,
    executionPlanPreview,
    setExecutionPlanPreview,
    executionPlanBusy,
    setExecutionPlanBusy,
    executionPlanSaveBusy,
    setExecutionPlanSaveBusy,
    executionPlanError,
    setExecutionPlanError,
    resetPanelsForSession,
  };
}
