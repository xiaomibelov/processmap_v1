import test from "node:test";
import assert from "node:assert/strict";

import { applyMarkdownAction } from "./markdownComposerActions.js";

function selectedRange(text, selected) {
  const start = text.indexOf(selected);
  assert.notEqual(start, -1);
  return [start, start + selected.length];
}

test("bold wraps selection and empty selection inserts a selected placeholder", () => {
  const value = "Проверить температуру";
  const [start, end] = selectedRange(value, "температуру");
  assert.deepEqual(applyMarkdownAction(value, start, end, "bold"), {
    text: "Проверить **температуру**",
    selectionStart: "Проверить **".length,
    selectionEnd: "Проверить **температуру".length,
  });

  assert.deepEqual(applyMarkdownAction("", 0, 0, "bold"), {
    text: "**текст**",
    selectionStart: 2,
    selectionEnd: 7,
  });
});

test("italic wraps selection with single asterisks", () => {
  assert.deepEqual(applyMarkdownAction("abc", 0, 3, "italic"), {
    text: "*abc*",
    selectionStart: 1,
    selectionEnd: 4,
  });
});

test("inline code wraps single-line selection and multiline selection uses a code block", () => {
  assert.deepEqual(applyMarkdownAction("abc", 0, 3, "inlineCode"), {
    text: "`abc`",
    selectionStart: 1,
    selectionEnd: 4,
  });

  assert.deepEqual(applyMarkdownAction("a\nb", 0, 3, "inlineCode"), {
    text: "```\na\nb\n```",
    selectionStart: 4,
    selectionEnd: 7,
  });
});

test("quote and list actions prefix selected lines", () => {
  assert.deepEqual(applyMarkdownAction("one\ntwo", 0, 7, "quote"), {
    text: "> one\n> two",
    selectionStart: 2,
    selectionEnd: 9,
  });
  assert.deepEqual(applyMarkdownAction("one\ntwo", 0, 7, "bulletList"), {
    text: "- one\n- two",
    selectionStart: 2,
    selectionEnd: 9,
  });
  assert.deepEqual(applyMarkdownAction("one\ntwo", 0, 7, "numberedList"), {
    text: "1. one\n2. two",
    selectionStart: 3,
    selectionEnd: 10,
  });
});

test("link wraps selected text or inserts a selected label placeholder", () => {
  assert.deepEqual(applyMarkdownAction("регламент", 0, 9, "link"), {
    text: "[регламент](https://)",
    selectionStart: 12,
    selectionEnd: 20,
  });

  assert.deepEqual(applyMarkdownAction("", 0, 0, "link"), {
    text: "[текст ссылки](https://)",
    selectionStart: 1,
    selectionEnd: 13,
  });
});
