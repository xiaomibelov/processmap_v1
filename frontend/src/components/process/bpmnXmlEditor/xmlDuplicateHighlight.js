import { EditorView, Decoration } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { buildElementKey } from "./xmlDuplicateDetector";

/**
 * Effect that replaces the current duplicate-highlight decorations.
 * Payload: DecorationSet.
 */
export const setDuplicateHighlights = StateEffect.define();

/**
 * Effect that clears all duplicate-highlight decorations.
 */
export const clearDuplicateHighlights = StateEffect.define();

/**
 * StateField holding the duplicate-highlight decorations.
 * Decorations are only (re)computed on explicit scans (toolbar button);
 * between scans they are mapped through document changes, so they may go
 * stale while the user edits — that is acceptable by design.
 */
export const duplicateHighlightField = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    let next = tr.docChanged ? value.map(tr.changes) : value;
    for (const effect of tr.effects) {
      if (effect.is(setDuplicateHighlights)) {
        next = effect.value;
      } else if (effect.is(clearDuplicateHighlights)) {
        next = Decoration.none;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function stripQuotes(value) {
  return String(value || "").replace(/^["']|["']$/g, "");
}

/**
 * Walk the Lezer syntax tree and locate duplicate sibling elements,
 * mirroring the logical definition from xmlDuplicateDetector.js
 * (tag name + all attributes + trimmed text content, per parent).
 * Positions come straight from tree nodes, so no text search is needed.
 *
 * @param {import("@codemirror/state").EditorState} state
 * @returns {Array<{ from: number, to: number, tagName: string, occurrenceIndex: number }>}
 *   Sorted by document position.
 */
export function findDuplicateRanges(state) {
  const tree = syntaxTree(state);
  if (!tree || tree.length === 0) return [];

  const ranges = [];
  const stack = []; // open Element frames
  const rootSeen = new Map(); // keys of top-level elements

  tree.cursor().iterate(
    (node) => {
      const name = node?.name;
      if (!name) return;

      if (name === "Element") {
        stack.push({
          tagName: null,
          attributes: {},
          attrName: null,
          text: "",
          from: node.from,
          to: node.to,
          seen: new Map(),
        });
        return;
      }

      if (stack.length === 0) return;
      const frame = stack[stack.length - 1];

      if (name === "TagName") {
        // The first TagName inside an Element belongs to its open tag;
        // the close tag repeats the same name and is ignored.
        if (frame.tagName === null) {
          frame.tagName = state.doc.sliceString(node.from, node.to);
        }
        return;
      }

      if (name === "AttributeName") {
        frame.attrName = state.doc.sliceString(node.from, node.to);
        return;
      }

      if (name === "AttributeValue") {
        if (frame.attrName !== null) {
          frame.attributes[frame.attrName] = stripQuotes(state.doc.sliceString(node.from, node.to));
        }
        frame.attrName = null;
        return;
      }

      if (name === "Text" || name === "Cdata") {
        // textContent of an element includes all descendant text.
        const chunk = state.doc.sliceString(node.from, node.to);
        for (const ancestor of stack) {
          ancestor.text += chunk;
        }
        return;
      }
    },
    (node) => {
      if (node?.name !== "Element") return;
      const frame = stack.pop();
      if (!frame || frame.tagName === null) return;

      const key = buildElementKey(frame.tagName, frame.attributes, frame.text);
      const parentSeen = stack.length > 0 ? stack[stack.length - 1].seen : rootSeen;
      const occurrenceIndex = parentSeen.get(key) || 0;
      parentSeen.set(key, occurrenceIndex + 1);
      if (occurrenceIndex > 0) {
        ranges.push({
          from: frame.from,
          to: frame.to,
          tagName: frame.tagName,
          occurrenceIndex,
        });
      }
    },
  );

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return ranges;
}

/**
 * Scan the current document for duplicate elements and highlight them.
 *
 * @param {EditorView} view
 * @returns {number} number of duplicate elements found
 */
export function scanDuplicateHighlights(view) {
  let ranges = [];
  try {
    ranges = findDuplicateRanges(view.state);
  } catch (err) {
    if (typeof console !== "undefined" && console.error) {
      console.error("scanDuplicateHighlights error:", err);
    }
    ranges = [];
  }

  const builder = new RangeSetBuilder();
  for (const range of ranges) {
    if (range.to <= range.from) continue;
    builder.add(
      range.from,
      range.to,
      Decoration.mark({
        class: "cm-duplicate-highlight",
        attributes: {
          title: `Дублирующийся элемент <${range.tagName}> (вхождение ${range.occurrenceIndex + 1})`,
        },
      }),
    );
  }

  view.dispatch({ effects: setDuplicateHighlights.of(builder.finish()) });
  return ranges.length;
}

/**
 * Remove all duplicate-highlight decorations from the editor.
 *
 * @param {EditorView} view
 */
export function clearDuplicateHighlightDecorations(view) {
  view.dispatch({ effects: clearDuplicateHighlights.of(null) });
}
