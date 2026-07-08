import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { xml } from "@codemirror/lang-xml";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, ViewPlugin, Decoration, MatchDecorator } from "@codemirror/view";
import { SearchCursor } from "@codemirror/search";

/**
 * Custom highlight matcher for BPMN XML.
 * Adds CSS classes to:
 * - zeebe:property / camunda:property elements
 * - bpmn:Task, bpmn:UserTask, bpmn:SequenceFlow elements
 */
const bpmnXmlHighlightMatcher = new MatchDecorator({
  regexp: /<(\/?)(zeebe:|camunda:)(properties|property)\b|<(\/?)(bpmn:)(task|userTask|sequenceFlow|serviceTask|startEvent|endEvent|exclusiveGateway|parallelGateway|inclusiveGateway|boundaryEvent)\b/gi,
  decoration: (match) => {
    const lower = match[0].toLowerCase();
    const isProperty = lower.includes(":property") || lower.includes(":properties");
    const isUserTask = lower.includes("bpmn:usertask");
    const isSequenceFlow = lower.includes("bpmn:sequenceflow");
    const isTask = lower.includes("bpmn:task") && !isUserTask;
    let className = "xml-highlight--tag";
    if (isProperty) className = "xml-highlight--property";
    else if (isUserTask) className = "xml-highlight--user-task";
    else if (isSequenceFlow) className = "xml-highlight--sequence-flow";
    else if (isTask) className = "xml-highlight--task";
    return Decoration.mark({ class: className });
  },
});

const bpmnXmlHighlightPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = bpmnXmlHighlightMatcher.createDeco(view);
    }

    update(update) {
      this.decorations = bpmnXmlHighlightMatcher.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (instance) => instance.decorations,
  },
);

/**
 * Debounce helper.
 */
function useDebouncedCallback(callback, delay) {
  const timeoutRef = useRef(null);
  return useCallback(
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    },
    [callback, delay],
  );
}

/**
 * XmlEditor — CodeMirror 6 wrapper for BPMN XML.
 *
 * Props:
 * - value: string (current XML)
 * - onChange: (value: string) => void
 * - onApply?: (value: string) => void — called after debounce when user stops typing
 * - height?: string — editor height (default "100%")
 * - readOnly?: boolean
 * - className?: string
 */
export default function XmlEditor({
  value,
  onChange,
  onApply,
  height = "100%",
  readOnly = false,
  className = "",
}) {
  const [internalValue, setInternalValue] = useState(value);
  const isTypingRef = useRef(false);

  // Keep internal value in sync with prop when not typing.
  useEffect(() => {
    if (!isTypingRef.current) {
      setInternalValue(value);
    }
  }, [value]);

  const debouncedApply = useDebouncedCallback((nextValue) => {
    isTypingRef.current = false;
    onApply?.(nextValue);
  }, 600);

  const handleChange = useCallback(
    (nextValue) => {
      isTypingRef.current = true;
      setInternalValue(nextValue);
      onChange?.(nextValue);
      debouncedApply(nextValue);
    },
    [onChange, debouncedApply],
  );

  const extensions = [xml(), bpmnXmlHighlightPlugin, EditorView.lineWrapping];

  return (
    <div className={`xmlEditorRoot ${className}`} style={{ height }}>
      <CodeMirror
        value={internalValue}
        height="100%"
        theme={oneDark}
        extensions={extensions}
        onChange={handleChange}
        editable={!readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          searchKeymap: true,
          foldKeymap: true,
          completionKeymap: false,
        }}
      />
    </div>
  );
}

// Re-export search helpers so callers can implement find/replace UI if needed.
export { SearchCursor };
