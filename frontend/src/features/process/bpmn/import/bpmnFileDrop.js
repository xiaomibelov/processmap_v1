// Pure helpers for BPMN file import via drag-and-drop / file picker.
// Extracted from components/ProcessStage.jsx without logic changes
// (behavior-preserving move) so the decision logic is testable.

export const BPMN_IMPORT_FILE_TYPE_ERROR =
  "Можно импортировать только BPMN/XML файлы с расширением .bpmn или .xml.";
export const BPMN_IMPORT_EMPTY_FILE_ERROR = "Файл пустой.";
export const BPMN_IMPORT_NOT_XML_ERROR = "Похоже, это не BPMN/XML файл.";

export function eventHasExternalFiles(event) {
  const types = event?.dataTransfer?.types;
  if (!types) return false;
  if (typeof types.includes === "function") return types.includes("Files");
  return Array.from(types).includes("Files");
}

export function isBpmnImportFile(file) {
  if (!file) return false;
  const name = String(file.name || "").trim().toLowerCase();
  const type = String(file.type || "").trim().toLowerCase();
  const hasValidExtension = name.endsWith(".bpmn") || name.endsWith(".xml");
  const hasValidMime = !type
    || type === "text/xml"
    || type === "application/xml"
    || type === "application/bpmn+xml"
    || type === "application/octet-stream"
    || type.endsWith("+xml");
  return hasValidExtension && hasValidMime;
}

// Returns "" when the file passes the extension/MIME gate, otherwise the
// exact error message shown to the user.
export function validateBpmnImportFile(file) {
  return isBpmnImportFile(file) ? "" : BPMN_IMPORT_FILE_TYPE_ERROR;
}

// Content sniff: rejects empty and non-XML payloads before the real import.
// Returns "" when the text looks like BPMN/XML, otherwise the exact error.
export function validateBpmnImportText(text) {
  const value = String(text || "").trim();
  if (!value) return BPMN_IMPORT_EMPTY_FILE_ERROR;
  if (!value.includes("<") || (!value.includes("bpmn:") && !value.includes("definitions"))) {
    return BPMN_IMPORT_NOT_XML_ERROR;
  }
  return "";
}
