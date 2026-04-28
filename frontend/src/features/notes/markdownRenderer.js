import React from "react";

function text(value) {
  return String(value || "");
}

function isSafeMarkdownHref(rawHref) {
  const href = text(rawHref).trim();
  if (!href || /[\u0000-\u001f\u007f\s]/u.test(href)) return false;
  const lower = href.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:");
}

function findNextInlineToken(source, startIndex) {
  const indexes = [
    source.indexOf("`", startIndex),
    source.indexOf("**", startIndex),
    source.indexOf("*", startIndex),
    source.indexOf("[", startIndex),
  ].filter((idx) => idx >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

export function renderNoteInlineMarkdown(value, keyPrefix = "note_md_inline") {
  const source = text(value);
  if (!source) return "";
  const out = [];
  let cursor = 0;
  let index = 0;

  while (cursor < source.length) {
    const next = findNextInlineToken(source, cursor);
    if (next < 0) {
      out.push(source.slice(cursor));
      break;
    }
    if (next > cursor) out.push(source.slice(cursor, next));

    if (source.startsWith("`", next)) {
      const end = source.indexOf("`", next + 1);
      if (end > next + 1) {
        out.push(React.createElement(
          "code",
          { key: `${keyPrefix}_code_${index++}`, className: "rounded bg-panel2 px-1 py-0.5 text-[0.95em]" },
          source.slice(next + 1, end),
        ));
        cursor = end + 1;
        continue;
      }
    }

    if (source.startsWith("**", next)) {
      const end = source.indexOf("**", next + 2);
      if (end > next + 2) {
        out.push(React.createElement(
          "strong",
          { key: `${keyPrefix}_strong_${index++}`, className: "font-semibold text-fg" },
          renderNoteInlineMarkdown(source.slice(next + 2, end), `${keyPrefix}_strong_${index}`),
        ));
        cursor = end + 2;
        continue;
      }
    }

    if (source.startsWith("*", next) && !source.startsWith("**", next)) {
      const end = source.indexOf("*", next + 1);
      if (end > next + 1) {
        out.push(React.createElement(
          "em",
          { key: `${keyPrefix}_em_${index++}`, className: "italic" },
          renderNoteInlineMarkdown(source.slice(next + 1, end), `${keyPrefix}_em_${index}`),
        ));
        cursor = end + 1;
        continue;
      }
    }

    if (source.startsWith("[", next)) {
      const labelEnd = source.indexOf("]", next + 1);
      const hrefStart = labelEnd >= 0 && source[labelEnd + 1] === "(" ? labelEnd + 2 : -1;
      const hrefEnd = hrefStart >= 0 ? source.indexOf(")", hrefStart) : -1;
      if (labelEnd > next + 1 && hrefEnd > hrefStart) {
        const label = source.slice(next + 1, labelEnd);
        const href = source.slice(hrefStart, hrefEnd).trim();
        if (isSafeMarkdownHref(href)) {
          out.push(React.createElement(
            "a",
            {
              key: `${keyPrefix}_link_${index++}`,
              href,
              target: "_blank",
              rel: "noopener noreferrer",
              className: "font-medium text-info underline underline-offset-2",
            },
            renderNoteInlineMarkdown(label, `${keyPrefix}_link_${index}`),
          ));
        } else {
          out.push(label);
        }
        cursor = hrefEnd + 1;
        continue;
      }
    }

    out.push(source[next]);
    cursor = next + 1;
  }

  return out;
}

function renderInlineWithBreaks(value, keyPrefix) {
  const lines = text(value).split(/\r?\n/u);
  const out = [];
  lines.forEach((line, index) => {
    if (index > 0) out.push(React.createElement("br", { key: `${keyPrefix}_br_${index}` }));
    out.push(...[].concat(renderNoteInlineMarkdown(line, `${keyPrefix}_line_${index}`)));
  });
  return out;
}

function isCodeFence(line) {
  return /^```/.test(text(line).trim());
}

function isBlockStart(line) {
  const trimmed = text(line).trim();
  return !trimmed
    || isCodeFence(trimmed)
    || /^>\s?/.test(trimmed)
    || /^[-*]\s+/.test(trimmed)
    || /^\d+[.)]\s+/.test(trimmed);
}

export function renderNoteMarkdown(value) {
  const lines = text(value).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = text(lines[i]);
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    if (isCodeFence(trimmed)) {
      i += 1;
      const codeLines = [];
      while (i < lines.length && !isCodeFence(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && isCodeFence(lines[i])) i += 1;
      blocks.push(React.createElement(
        "pre",
        { key: `note_md_pre_${key++}`, className: "overflow-auto rounded-lg border border-border bg-bg/70 px-3 py-2 text-xs leading-relaxed text-fg" },
        React.createElement("code", null, codeLines.join("\n")),
      ));
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(text(lines[i]).trim())) {
        quoteLines.push(text(lines[i]).trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(React.createElement(
        "blockquote",
        { key: `note_md_quote_${key++}`, className: "border-l-2 border-info/45 pl-3 text-muted" },
        renderInlineWithBreaks(quoteLines.join("\n"), `note_md_quote_in_${key}`),
      ));
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(text(lines[i]).trim())) {
        items.push(text(lines[i]).trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(React.createElement(
        "ul",
        { key: `note_md_ul_${key++}`, className: "list-disc space-y-1 pl-5" },
        items.map((item, idx) => React.createElement(
          "li",
          { key: `note_md_ul_item_${idx}` },
          renderNoteInlineMarkdown(item, `note_md_ul_in_${idx}`),
        )),
      ));
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(text(lines[i]).trim())) {
        items.push(text(lines[i]).trim().replace(/^\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push(React.createElement(
        "ol",
        { key: `note_md_ol_${key++}`, className: "list-decimal space-y-1 pl-5" },
        items.map((item, idx) => React.createElement(
          "li",
          { key: `note_md_ol_item_${idx}` },
          renderNoteInlineMarkdown(item, `note_md_ol_in_${idx}`),
        )),
      ));
      continue;
    }

    const paragraphLines = [line];
    i += 1;
    while (i < lines.length && !isBlockStart(lines[i])) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    blocks.push(React.createElement(
      "p",
      { key: `note_md_p_${key++}`, className: "m-0" },
      renderInlineWithBreaks(paragraphLines.join("\n"), `note_md_p_in_${key}`),
    ));
  }

  return blocks.length ? blocks : [React.createElement("span", { key: "note_md_empty" }, "")];
}

export default function NoteMarkdown({ children }) {
  return React.createElement(
    "div",
    {
      className: "noteMarkdownBody mt-1.5 space-y-2 text-sm leading-6 text-fg",
      "data-testid": "notes-comment-markdown",
    },
    renderNoteMarkdown(children),
  );
}
