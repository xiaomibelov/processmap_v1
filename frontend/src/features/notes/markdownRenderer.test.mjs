import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderNoteMarkdown } from "./markdownRenderer.js";

function html(markdown) {
  return renderToStaticMarkup(React.createElement("div", null, renderNoteMarkdown(markdown)));
}

test("note markdown preserves plain text and line breaks", () => {
  const out = html("первая\nвторая");
  assert.match(out, /первая<br\/>вторая/);
});

test("note markdown renders inline formatting", () => {
  const out = html("**Жирный** и *курсив*, `код`");
  assert.match(out, /<strong[^>]*>Жирный<\/strong>/);
  assert.match(out, /<em[^>]*>курсив<\/em>/);
  assert.match(out, /<code[^>]*>код<\/code>/);
});

test("note markdown renders code blocks, quotes, and lists", () => {
  const out = html([
    "```",
    "const x = 1;",
    "```",
    "",
    "> цитата",
    "",
    "- пункт",
    "- второй",
    "",
    "1. первый",
    "2. второй",
  ].join("\n"));
  assert.match(out, /<pre[^>]*><code>const x = 1;<\/code><\/pre>/);
  assert.match(out, /<blockquote[^>]*>цитата<\/blockquote>/);
  assert.match(out, /<ul[^>]*>[\s\S]*<li>пункт<\/li>[\s\S]*<li>второй<\/li>[\s\S]*<\/ul>/);
  assert.match(out, /<ol[^>]*>[\s\S]*<li>первый<\/li>[\s\S]*<li>второй<\/li>[\s\S]*<\/ol>/);
});

test("note markdown allows safe links with target and rel", () => {
  const out = html("[ссылка](https://example.test/path)");
  assert.match(out, /<a[^>]*href="https:\/\/example\.test\/path"/);
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="noopener noreferrer"/);
});

test("note markdown blocks unsafe links and raw HTML execution", () => {
  const out = html("[bad](javascript:alert(1)) <img src=x onerror=alert(1)>");
  assert.doesNotMatch(out, /href=/);
  assert.doesNotMatch(out, /javascript:alert/);
  assert.doesNotMatch(out, /<img\b/);
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
