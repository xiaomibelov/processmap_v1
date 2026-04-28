const PLACEHOLDERS = {
  bold: "текст",
  italic: "текст",
  inlineCode: "код",
  quote: "цитата",
  bulletList: "пункт",
  numberedList: "пункт",
  link: "текст ссылки",
};

function normalizeSelection(value, selectionStart = 0, selectionEnd = 0) {
  const text = String(value || "");
  const start = Math.max(0, Math.min(Number(selectionStart || 0), text.length));
  const end = Math.max(start, Math.min(Number(selectionEnd || start), text.length));
  return { text, start, end, selected: text.slice(start, end) };
}

function replaceRange(text, start, end, inserted, selectionStart, selectionEnd) {
  return {
    text: `${text.slice(0, start)}${inserted}${text.slice(end)}`,
    selectionStart,
    selectionEnd,
  };
}

function wrapInline(value, selectionStart, selectionEnd, left, right, placeholder) {
  const { text, start, end, selected } = normalizeSelection(value, selectionStart, selectionEnd);
  const content = selected || placeholder;
  const inserted = `${left}${content}${right}`;
  const innerStart = start + left.length;
  return replaceRange(text, start, end, inserted, innerStart, innerStart + content.length);
}

function wrapCode(value, selectionStart, selectionEnd) {
  const { text, start, end, selected } = normalizeSelection(value, selectionStart, selectionEnd);
  const content = selected || PLACEHOLDERS.inlineCode;
  if (content.includes("\n")) {
    const inserted = `\`\`\`\n${content}\n\`\`\``;
    const innerStart = start + 4;
    return replaceRange(text, start, end, inserted, innerStart, innerStart + content.length);
  }
  return wrapInline(value, selectionStart, selectionEnd, "`", "`", PLACEHOLDERS.inlineCode);
}

function linePrefix(value, selectionStart, selectionEnd, prefixForLine, placeholder) {
  const { text, start, end, selected } = normalizeSelection(value, selectionStart, selectionEnd);
  const content = selected || placeholder;
  const lines = content.split("\n");
  const inserted = lines.map((line, index) => `${prefixForLine(index)}${line}`).join("\n");
  const firstPrefixLength = prefixForLine(0).length;
  const innerStart = start + firstPrefixLength;
  return replaceRange(text, start, end, inserted, innerStart, innerStart + content.length);
}

function link(value, selectionStart, selectionEnd) {
  const { text, start, end, selected } = normalizeSelection(value, selectionStart, selectionEnd);
  const label = selected || PLACEHOLDERS.link;
  const url = "https://";
  const inserted = `[${label}](${url})`;
  if (selected) {
    const urlStart = start + label.length + 3;
    return replaceRange(text, start, end, inserted, urlStart, urlStart + url.length);
  }
  const labelStart = start + 1;
  return replaceRange(text, start, end, inserted, labelStart, labelStart + label.length);
}

export function applyMarkdownAction(value, selectionStart = 0, selectionEnd = 0, action = "") {
  if (action === "bold") {
    return wrapInline(value, selectionStart, selectionEnd, "**", "**", PLACEHOLDERS.bold);
  }
  if (action === "italic") {
    return wrapInline(value, selectionStart, selectionEnd, "*", "*", PLACEHOLDERS.italic);
  }
  if (action === "inlineCode") {
    return wrapCode(value, selectionStart, selectionEnd);
  }
  if (action === "quote") {
    return linePrefix(value, selectionStart, selectionEnd, () => "> ", PLACEHOLDERS.quote);
  }
  if (action === "bulletList") {
    return linePrefix(value, selectionStart, selectionEnd, () => "- ", PLACEHOLDERS.bulletList);
  }
  if (action === "numberedList") {
    return linePrefix(value, selectionStart, selectionEnd, (index) => `${index + 1}. `, PLACEHOLDERS.numberedList);
  }
  if (action === "link") {
    return link(value, selectionStart, selectionEnd);
  }
  const { text, start, end } = normalizeSelection(value, selectionStart, selectionEnd);
  return { text, selectionStart: start, selectionEnd: end };
}

export const MARKDOWN_COMPOSER_ACTIONS = [
  { action: "bold", label: "B", ariaLabel: "Жирный", title: "Жирный" },
  { action: "italic", label: "I", ariaLabel: "Курсив", title: "Курсив" },
  { action: "inlineCode", label: "Код", ariaLabel: "Код", title: "Код" },
  { action: "quote", label: "Цитата", ariaLabel: "Цитата", title: "Цитата" },
  { action: "bulletList", label: "Список", ariaLabel: "Маркированный список", title: "Маркированный список" },
  { action: "numberedList", label: "1.", ariaLabel: "Нумерованный список", title: "Нумерованный список" },
  { action: "link", label: "Ссылка", ariaLabel: "Ссылка", title: "Ссылка" },
];
