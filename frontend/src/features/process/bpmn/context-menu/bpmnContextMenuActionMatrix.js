function toText(value) {
  return String(value || "").trim();
}

function toLower(value) {
  return toText(value).toLowerCase();
}

function normalizeBpmnType(targetRaw) {
  const target = targetRaw && typeof targetRaw === "object" ? targetRaw : {};
  return toLower(target.bpmnType || target.type || target.elementType);
}

export function resolveBpmnContextTargetKind(targetRaw = null) {
  const target = targetRaw && typeof targetRaw === "object" ? targetRaw : {};
  const kind = toLower(target.kind || target.scope || target.targetKind);
  const type = normalizeBpmnType(target);
  const explicitConnection = target.isConnection === true || kind === "connection";

  if (kind === "canvas" || (!type && !toText(target.id) && !explicitConnection)) return "canvas";
  if (explicitConnection || type.includes("sequenceflow")) return "sequence_flow";
  if (type.includes("subprocess")) return "subprocess";
  if (type.includes("gateway")) return "gateway";
  if (type.includes("startevent")) return "start_event";
  if (type.includes("endevent")) return "end_event";
  if (type.includes("task")) return "task";
  return "unsupported";
}

function action(id, label, group, options = {}) {
  return {
    id,
    label,
    group,
    destructive: options.destructive === true,
  };
}

const ACTIONS_BY_KIND = Object.freeze({
  canvas: [
    action("create_task", "Create Task", "primary"),
    action("create_gateway", "Create Gateway", "primary"),
    action("create_start_event", "Create Start Event", "primary"),
    action("create_end_event", "Create End Event", "primary"),
    action("create_subprocess", "Create Subprocess", "primary"),
    action("paste", "Paste", "utility"),
    action("add_annotation", "Add Annotation", "structural"),
  ],
  task: [
    action("rename", "Rename", "primary"),
    action("open_properties", "Open Properties", "primary"),
    action("add_next_step", "Add Next Step", "primary"),
    action("duplicate", "Duplicate", "structural"),
    action("copy_name", "Copy Name", "utility"),
    action("copy_id", "Copy ID", "utility"),
    action("delete", "Delete", "destructive", { destructive: true }),
  ],
  gateway: [
    action("rename", "Rename", "primary"),
    action("open_properties", "Open Properties", "primary"),
    action("add_outgoing_branch", "Add Outgoing Branch", "primary"),
    action("duplicate", "Duplicate", "structural"),
    action("copy_name", "Copy Name", "utility"),
    action("copy_id", "Copy ID", "utility"),
    action("delete", "Delete", "destructive", { destructive: true }),
  ],
  start_event: [
    action("rename", "Rename", "primary"),
    action("open_properties", "Open Properties", "primary"),
    action("add_next_step", "Add Next Step", "primary"),
    action("duplicate", "Duplicate", "structural"),
    action("copy_name", "Copy Name", "utility"),
    action("copy_id", "Copy ID", "utility"),
    action("delete", "Delete", "destructive", { destructive: true }),
  ],
  end_event: [
    action("rename", "Rename", "primary"),
    action("open_properties", "Open Properties", "primary"),
    action("duplicate", "Duplicate", "structural"),
    action("copy_name", "Copy Name", "utility"),
    action("copy_id", "Copy ID", "utility"),
    action("delete", "Delete", "destructive", { destructive: true }),
  ],
  subprocess: [
    action("rename", "Rename", "primary"),
    action("open_properties", "Open Properties", "primary"),
    action("open_inside", "Open Inside", "primary"),
    action("add_next_step", "Add Next Step", "primary"),
    action("duplicate", "Duplicate", "structural"),
    action("copy_name", "Copy Name", "utility"),
    action("copy_id", "Copy ID", "utility"),
    action("delete", "Delete", "destructive", { destructive: true }),
  ],
  sequence_flow: [
    action("edit_label", "Edit Label", "primary"),
    action("open_properties", "Open Properties", "primary"),
    action("copy_id", "Copy ID", "utility"),
    action("delete", "Delete", "destructive", { destructive: true }),
  ],
});

export function resolveBpmnContextMenuActions(targetRaw = null) {
  const kind = resolveBpmnContextTargetKind(targetRaw);
  const actions = ACTIONS_BY_KIND[kind];
  return Array.isArray(actions) ? actions.slice() : [];
}

export function resolveBpmnContextMenuHeader(targetRaw = null) {
  const target = targetRaw && typeof targetRaw === "object" ? targetRaw : {};
  const kind = resolveBpmnContextTargetKind(targetRaw);
  if (kind === "canvas") return "Canvas";
  if (kind === "sequence_flow") return toText(target.name || target.id) || "Sequence Flow";
  return toText(target.name || target.id) || "BPMN Element";
}

