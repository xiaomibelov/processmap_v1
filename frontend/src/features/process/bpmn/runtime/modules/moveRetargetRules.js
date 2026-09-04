import RuleProvider from "diagram-js/lib/features/rules/RuleProvider.js";
import CommandInterceptor from "diagram-js/lib/command/CommandInterceptor.js";
import { is } from "bpmn-js/lib/util/ModelUtil.js";

function isConnectionElement(element) {
  return !!element && Array.isArray(element.waypoints);
}

function isCollaborationRoot(element) {
  return !!element && is(element, "bpmn:Collaboration");
}

function collaborationProcesses(collaboration) {
  const seen = [];
  const processes = [];
  for (const participant of collaboration.get("participants") || []) {
    const process = participant.get("processRef");
    if (process && !seen.includes(process)) {
      seen.push(process);
      processes.push(process);
    }
  }
  return processes;
}

function firstProcessParticipant(rootElement) {
  const collaboration = rootElement?.businessObject;
  if (!collaboration || !is(collaboration, "bpmn:Collaboration")) return null;
  const processes = collaborationProcesses(collaboration);
  const first = processes[0];
  if (!first) return null;
  const children = Array.isArray(rootElement.children) ? rootElement.children : [];
  return (
    children.find(
      (child) =>
        is(child, "bpmn:Participant") &&
        child.businessObject &&
        child.businessObject.get("processRef") === first
    ) || null
  );
}

function isOwnFlowOrMultiSelection(shapes, connection) {
  if (!Array.isArray(shapes) || shapes.length === 0 || !connection) return false;
  if (shapes.length > 1) return true;
  const shape = shapes[0];
  return connection.source === shape || connection.target === shape;
}

function findRetargetParent(target) {
  if (isConnectionElement(target)) {
    const parent = target.parent;
    if (!parent) return null;
    if (isCollaborationRoot(parent)) return firstProcessParticipant(parent);
    return parent;
  }
  if (isCollaborationRoot(target)) return firstProcessParticipant(target);
  return null;
}

class MoveRetargetRules extends RuleProvider {
  init() {
    this.addRule("elements.move", 20000, (context) => {
      const shapes = context?.shapes;
      const target = context?.target;
      if (!Array.isArray(shapes) || shapes.length === 0 || !target) return undefined;

      if (isConnectionElement(target)) {
        if (!isOwnFlowOrMultiSelection(shapes, target)) return undefined;
        return findRetargetParent(target) ? true : undefined;
      }

      if (isCollaborationRoot(target)) {
        return firstProcessParticipant(target) ? true : undefined;
      }

      return undefined;
    });

    this.addRule("shape.create", 20000, (context) => {
      const shape = context?.shape;
      const target = context?.target;
      if (!shape || !isCollaborationRoot(target)) return undefined;
      return firstProcessParticipant(target) ? true : undefined;
    });
  }
}

MoveRetargetRules.$inject = ["eventBus"];

class MoveRetargetBehavior extends CommandInterceptor {
  constructor(eventBus) {
    super(eventBus);

    this.preExecute("elements.move", 500, (event) => {
      const context = event.context;
      const newParent = context?.newParent;
      if (!newParent) return;

      if (isConnectionElement(newParent)) {
        if (!isOwnFlowOrMultiSelection(context.shapes || [], newParent)) return;
        const parent = findRetargetParent(newParent);
        if (parent) context.newParent = parent;
        return;
      }

      if (isCollaborationRoot(newParent)) {
        const participant = firstProcessParticipant(newParent);
        if (participant) context.newParent = participant;
      }
    });

    this.preExecute("shape.create", 500, (event) => {
      const context = event.context;
      const parent = context?.parent;
      if (!parent || !isCollaborationRoot(parent)) return;
      const participant = firstProcessParticipant(parent);
      if (participant) context.parent = participant;
    });
  }
}

MoveRetargetBehavior.$inject = ["eventBus"];

export default {
  __init__: ["fpcMoveRetargetRules", "fpcMoveRetargetBehavior"],
  fpcMoveRetargetRules: ["type", MoveRetargetRules],
  fpcMoveRetargetBehavior: ["type", MoveRetargetBehavior],
};
