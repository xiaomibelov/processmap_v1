import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine,
  ViewPlugin } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { xml } from "@codemirror/lang-xml";
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle,
  bracketMatching } from "@codemirror/language";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { lintGutter } from "@codemirror/lint";
import { bpmnXmlLinter } from "./xmlLinter";
import "./BpmnXmlCodeEditor.css";

function buildLightTheme() {
  return EditorView.theme({
    "&": {
      backgroundColor: "#ffffff",
      color: "#1f2937",
      fontSize: "13px",
      lineHeight: "1.5",
    },
    ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", caretColor: "#2563eb" },
    ".cm-cursor": { borderLeftColor: "#2563eb" },
    ".cm-gutters": {
      backgroundColor: "#f9fafb",
      color: "#6b7280",
      borderRight: "1px solid #e5e7eb",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    ".cm-activeLineGutter": { backgroundColor: "#e5e7eb" },
    ".cm-activeLine": { backgroundColor: "rgba(37, 99, 235, 0.06)" },
    ".cm-selectionBackground": { background: "rgba(37, 99, 235, 0.2)" },
    ".cm-foldPlaceholder": { backgroundColor: "#f3f4f6", borderColor: "#d1d5db", color: "#374151" },
    ".cm-lineNumbers": { color: "#9ca3af" },
    ".cm-matchingBracket": { borderBottom: "1px solid #2563eb" },
    ".cm-nonmatchingBracket": { backgroundColor: "rgba(239, 68, 68, 0.2)" },
  }, { dark: false });
}

/**
 * CodeMirror 6 wrapper for BPMN XML editing.
 *
 * Props:
 * - value: string
 * - onChange: (value: string) => void
 * - onSave: () => void
 * - readOnly?: boolean
 * - className?: string
 */
export default function BpmnXmlCodeEditor({
  value = "",
  onChange,
  onSave,
  onCursorActivity,
  readOnly = false,
  className = "",
}) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onCursorActivityRef = useRef(onCursorActivity);
  const themeCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { onCursorActivityRef.current = onCursorActivity; }, [onCursorActivity]);

  useEffect(() => {
    const updateListener = ViewPlugin.fromClass(class {
      update(update) {
        if (update.docChanged && onChangeRef.current) {
          onChangeRef.current(update.state.doc.toString());
        }
        if (update.selectionSet && onCursorActivityRef.current) {
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);
          onCursorActivityRef.current(line.number, head - line.from + 1);
        }
      }
    });

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          if (onSaveRef.current) onSaveRef.current();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        saveKeymap,
        updateListener,
        xml(),
        search(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        lintGutter(),
        bpmnXmlLinter({ delay: 300 }),
        themeCompartment.current.of(buildLightTheme()),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        scrollIntoView: false,
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly]);

  return <div ref={hostRef} className={`bpmnXmlCodeEditor ${className}`} />;
}
