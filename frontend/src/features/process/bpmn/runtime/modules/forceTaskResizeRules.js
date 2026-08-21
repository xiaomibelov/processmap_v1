import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";

function asType(shape) {
  return String(shape?.businessObject?.$type || shape?.type || "").trim();
}

function isTaskLike(shape) {
  const raw = asType(shape).toLowerCase();
  if (!raw) return false;
  const simple = String(raw.split(":").pop() || raw).trim();
  return simple.endsWith("task") || simple === "subprocess" || simple === "callactivity";
}

class ForceTaskResizeRules extends RuleProvider {
  constructor(eventBus) {
    super(eventBus);
  }

  init() {
    // Keep default bpmn-js rules for everything else, but never block task-like resize.
    this.addRule("shape.resize", 20000, (context) => {
      const shape = context?.shape;
      if (!shape || !isTaskLike(shape)) return undefined;
      return true;
    });
  }
}

ForceTaskResizeRules.$inject = ["eventBus"];

export default {
  __init__: ["fpcForceTaskResizeRules"],
  fpcForceTaskResizeRules: ["type", ForceTaskResizeRules],
};

