function toText(value) {
  return String(value || "").trim();
}

export function isTechnicalBpmnId(value) {
  const raw = toText(value);
  if (!raw || /\s/.test(raw)) return false;
  return /^(Activity|Task|UserTask|ServiceTask|ScriptTask|ManualTask|BusinessRuleTask|SendTask|ReceiveTask|CallActivity|SubProcess|Gateway|Event|StartEvent|EndEvent|Flow|SequenceFlow|Lane|Participant|DataObject|DataStoreReference)_[A-Za-z0-9][A-Za-z0-9_-]*$/.test(raw);
}

export function readableBpmnText(...values) {
  for (const value of values) {
    const label = toText(value);
    if (label && !isTechnicalBpmnId(label)) return label;
  }
  return "";
}
