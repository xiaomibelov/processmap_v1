import { linter } from "@codemirror/lint";

function extractLineNumber(message) {
  const match = String(message || "").match(/line\s+(\d+)/i);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function isBpmnDefinitionsRoot(doc) {
  const root = doc.documentElement;
  if (!root) return false;
  const localName = root.localName || root.tagName || "";
  const ns = String(root.namespaceURI || "").toLowerCase();
  return localName === "definitions" && ns.includes("bpmn");
}

/**
 * CodeMirror lint extension for BPMN XML.
 * Reports parser errors and missing BPMN definitions root element.
 *
 * @param {Object} [options]
 * @param {number} [options.delay=300]
 * @returns {import("@codemirror/lint").Extension}
 */
export function bpmnXmlLinter(options = {}) {
  const delay = Number(options.delay ?? 300);
  return linter((view) => {
    const text = view.state.doc.toString();
    if (!text.trim()) return [];

    if (typeof DOMParser === "undefined") return [];

    const doc = new DOMParser().parseFromString(text, "application/xml");
    const parserError = doc.getElementsByTagName("parsererror")[0];
    if (parserError) {
      const message = String(parserError.textContent || "")
        .replace(/\s+/g, " ")
        .trim() || "XML parsing error";
      const line = extractLineNumber(message);
      const lineObj = view.state.doc.line(Math.min(line, view.state.doc.lines));
      return [
        {
          from: lineObj.from,
          to: lineObj.to,
          severity: "error",
          message,
        },
      ];
    }

    if (!isBpmnDefinitionsRoot(doc)) {
      return [
        {
          from: 0,
          to: 0,
          severity: "error",
          message: "Missing BPMN definitions root element",
        },
      ];
    }

    return [];
  }, { delay });
}
