import { useEffect, useMemo, useRef, useState } from "react";
import "./BpmnXmlStructureView.css";

const SIGNIFICANT_LOCAL_NAMES = new Set([
  "definitions",
  "process",
  "collaboration",
  "participant",
  "task",
  "servicetask",
  "usertask",
  "sendtask",
  "receivetask",
  "manualtask",
  "scripttask",
  "businessruletask",
  "subprocess",
  "callactivity",
  "adhocsubprocess",
  "transaction",
  "exclusivegateway",
  "parallelgateway",
  "inclusivegateway",
  "eventbasedgateway",
  "complexgateway",
  "startevent",
  "endevent",
  "intermediatethrowevent",
  "intermediatecatchevent",
  "boundaryevent",
  "sequenceflow",
  "messageflow",
  "dataobject",
  "dataobjectreference",
  "datastore",
  "datastorereference",
  "textannotation",
  "properties",
  "property",
  "inputoutput",
]);

const EXTENSION_PREFIXES = new Set(["camunda", "pm", "zeebe"]);

function isSignificant(element) {
  const tag = element.tagName || "";
  const parts = tag.split(":");
  const prefix = parts.length > 1 ? parts[0].toLowerCase() : null;
  const local = parts.length > 1 ? parts[1].toLowerCase() : tag.toLowerCase();
  if (prefix && EXTENSION_PREFIXES.has(prefix)) return true;
  return SIGNIFICANT_LOCAL_NAMES.has(local);
}

function nodeLabel(element) {
  const tag = element.tagName || "";
  const id = element.getAttribute?.("id");
  const name = element.getAttribute?.("name");
  if (id && name) return `<${tag}> id="${id}" name="${name}"`;
  if (id) return `<${tag}> id="${id}"`;
  if (name) return `<${tag}> name="${name}"`;
  return `<${tag}>`;
}

function buildTree(xmlText) {
  if (typeof DOMParser === "undefined" || !xmlText.trim()) return null;
  try {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const parserError = doc.getElementsByTagName("parsererror")[0];
    if (parserError) return null;
    return doc.documentElement;
  } catch {
    return null;
  }
}

function collectNodes(element, xmlText, cursorRef, result) {
  if (!element) return;

  if (isSignificant(element)) {
    const tag = element.tagName || "";
    const search = tag ? `<${tag}` : null;
    const index = search ? xmlText.indexOf(search, cursorRef.value) : -1;
    const line = index >= 0 ? xmlText.slice(0, index).split("\n").length : 1;
    if (index >= 0) cursorRef.value = index + 1;

    const children = [];
    Array.from(element.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        collectNodes(child, xmlText, cursorRef, children);
      }
    });

    result.push({
      key: `${tag}-${line}-${index}`,
      label: nodeLabel(element),
      line,
      depth: 0,
      children,
    });
  } else {
    Array.from(element.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        collectNodes(child, xmlText, cursorRef, result);
      }
    });
  }
}

function assignDepth(nodes, depth = 0) {
  nodes.forEach((node) => {
    node.depth = depth;
    assignDepth(node.children, depth + 1);
  });
}

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, delay]);

  return debounced;
}

function StructureNode({ node, onSelect }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <li className="bpmnXmlStructureNode">
      <div className="bpmnXmlStructureRow" style={{ paddingLeft: `${node.depth * 12 + 8}px` }}>
        {hasChildren ? (
          <button
            type="button"
            className="bpmnXmlStructureToggle"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Свернуть" : "Развернуть"}
          >
            {expanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="bpmnXmlStructureTogglePlaceholder" />
        )}
        <button
          type="button"
          className="bpmnXmlStructureLabel"
          onClick={() => onSelect?.(node.line)}
          title={`Перейти к строке ${node.line}`}
        >
          {node.label}
        </button>
      </div>
      {hasChildren && expanded ? (
        <ul className="bpmnXmlStructureChildren">
          {node.children.map((child) => (
            <StructureNode key={child.key} node={child} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Structure/outline view for BPMN XML.
 *
 * Props:
 * - value: string (XML text)
 * - onSelectLine: (line: number) => void
 */
export default function BpmnXmlStructureView({ value, onSelectLine }) {
  const debouncedValue = useDebouncedValue(value, 500);

  const nodes = useMemo(() => {
    const root = buildTree(debouncedValue);
    const cursorRef = { value: 0 };
    const list = [];
    collectNodes(root, debouncedValue, cursorRef, list);
    assignDepth(list);
    return list;
  }, [debouncedValue]);

  if (!nodes || nodes.length === 0) {
    return (
      <div className="bpmnXmlStructureView">
        <div className="bpmnXmlStructureEmpty">Нет структуры</div>
      </div>
    );
  }

  return (
    <div className="bpmnXmlStructureView">
      <div className="bpmnXmlStructureHeader">Структура</div>
      <ul className="bpmnXmlStructureList">
        {nodes.map((node) => (
          <StructureNode key={node.key} node={node} onSelect={onSelectLine} />
        ))}
      </ul>
    </div>
  );
}
