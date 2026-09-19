export function applyFullBpmnDecorSet({
  inst,
  kind,
  applyTaskTypeDecor,
  applyLinkEventDecor,
  applyHappyFlowDecor,
  applyRobotMetaDecor,
  applyBottleneckDecor,
  applyInterviewDecor,
  applyUserNotesDecor,
  applyStepTimeDecor,
  applySubprocessDiscussionDecor,
  applyPropertiesOverlayDecor,
}) {
  if (!inst) return;
  applyTaskTypeDecor(inst, kind);
  applyLinkEventDecor(inst, kind);
  applyHappyFlowDecor(inst, kind);
  applyRobotMetaDecor(inst, kind);
  applyBottleneckDecor(inst, kind);
  applyInterviewDecor(inst, kind);
  applyUserNotesDecor(inst, kind);
  applySubprocessDiscussionDecor?.(inst, kind);
  applyStepTimeDecor(inst, kind);
  // Legacy property cards: без этого в полном сете после remote sync
  // (re-import) карточки пропадают до отложенного fanout
  // (fix/canvas-overlays-preferences-409 F1, audit H3).
  applyPropertiesOverlayDecor?.(inst, kind);
}
