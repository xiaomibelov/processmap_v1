import { useState } from "react";

export default function useProcessStageModeState({
  readCommandMode,
  readDiagramMode,
  readQualityProfile,
} = {}) {
  const [commandModeEnabled, setCommandModeEnabled] = useState(() => (
    typeof readCommandMode === "function" ? readCommandMode() : false
  ));
  const [diagramMode, setDiagramMode] = useState(() => (
    typeof readDiagramMode === "function" ? readDiagramMode() : "normal"
  ));
  const [qualityProfileId, setQualityProfileId] = useState(() => (
    typeof readQualityProfile === "function" ? readQualityProfile() : ""
  ));

  return {
    commandModeEnabled,
    setCommandModeEnabled,
    diagramMode,
    setDiagramMode,
    qualityProfileId,
    setQualityProfileId,
  };
}
