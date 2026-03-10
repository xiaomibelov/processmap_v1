import { useCallback } from "react";

export default function useProcessStageActionsController({
  setToolbarMenuOpen,
  setAttentionOpen,
  setQualityAutoFixOpen,
  setInsertBetweenOpen,
  setVersionsOpen,
  setDiffOpen,
  setCreateTemplateOpen,
  setTemplatesPickerOpen,
  closeAllDiagramActions,
}) {
  const toggleToolbarMenu = useCallback(() => {
    setToolbarMenuOpen((prev) => !prev);
  }, [setToolbarMenuOpen]);

  const closeToolbarMenu = useCallback(() => {
    setToolbarMenuOpen(false);
  }, [setToolbarMenuOpen]);

  const toggleAttentionPanel = useCallback(() => {
    setAttentionOpen((prev) => !prev);
  }, [setAttentionOpen]);

  const closeAttentionPanel = useCallback(() => {
    setAttentionOpen(false);
  }, [setAttentionOpen]);

  const openQualityAutoFix = useCallback(() => {
    setQualityAutoFixOpen(true);
  }, [setQualityAutoFixOpen]);

  const closeQualityAutoFix = useCallback(() => {
    setQualityAutoFixOpen(false);
  }, [setQualityAutoFixOpen]);

  const openInsertBetweenDialog = useCallback(() => {
    setInsertBetweenOpen(true);
  }, [setInsertBetweenOpen]);

  const closeInsertBetweenDialog = useCallback(() => {
    setInsertBetweenOpen(false);
  }, [setInsertBetweenOpen]);

  const openVersionsDialog = useCallback(() => {
    setVersionsOpen(true);
  }, [setVersionsOpen]);

  const closeVersionsDialog = useCallback(() => {
    setVersionsOpen(false);
  }, [setVersionsOpen]);

  const openDiffDialog = useCallback(() => {
    setDiffOpen(true);
  }, [setDiffOpen]);

  const closeDiffDialog = useCallback(() => {
    setDiffOpen(false);
  }, [setDiffOpen]);

  const closeCreateTemplateDialog = useCallback(() => {
    setCreateTemplateOpen(false);
  }, [setCreateTemplateOpen]);

  const closeTemplatesPickerDialog = useCallback(() => {
    setTemplatesPickerOpen(false);
  }, [setTemplatesPickerOpen]);

  const closeDiagramActions = useCallback(() => {
    closeAllDiagramActions?.();
  }, [closeAllDiagramActions]);

  return {
    toggleToolbarMenu,
    closeToolbarMenu,
    toggleAttentionPanel,
    closeAttentionPanel,
    openQualityAutoFix,
    closeQualityAutoFix,
    openInsertBetweenDialog,
    closeInsertBetweenDialog,
    openVersionsDialog,
    closeVersionsDialog,
    openDiffDialog,
    closeDiffDialog,
    closeCreateTemplateDialog,
    closeTemplatesPickerDialog,
    closeDiagramActions,
  };
}
