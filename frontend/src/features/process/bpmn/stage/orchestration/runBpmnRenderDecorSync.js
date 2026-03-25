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
}) {
  if (!inst) return;
  applyTaskTypeDecor(inst, kind);
  applyLinkEventDecor(inst, kind);
  applyHappyFlowDecor(inst, kind);
  applyRobotMetaDecor(inst, kind);
  applyBottleneckDecor(inst, kind);
  applyInterviewDecor(inst, kind);
  applyUserNotesDecor(inst, kind);
  applyStepTimeDecor(inst, kind);
}
