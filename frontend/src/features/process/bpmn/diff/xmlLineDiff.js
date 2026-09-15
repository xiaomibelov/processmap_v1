const MAX_DIFF_LINES = 3000;
const MAX_DIFF_BYTES = 200 * 1024;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function byteLength(text) {
  if (typeof Buffer !== "undefined") return Buffer.byteLength(text, "utf8");
  return new TextEncoder().encode(text).length;
}

const HIGHLIGHT_RE =
  /(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?[A-Za-z_][\w:.-]*)|([\w:.-]+)(?==)|(&quot;.*?&quot;)|(\/?&gt;)/g;

export function highlightXmlLine(text) {
  return escapeHtml(text).replace(HIGHLIGHT_RE, (match, comment, tagOpen, attrName, str, tagClose) => {
    if (comment) return `<span class="xmldiff-comment">${comment}</span>`;
    if (tagOpen) return `<span class="xmldiff-tag">${tagOpen}</span>`;
    if (attrName !== undefined) return `<span class="xmldiff-attr">${attrName}</span>`;
    if (str) return `<span class="xmldiff-string">${str}</span>`;
    if (tagClose) return `<span class="xmldiff-tag">${tagClose}</span>`;
    return match;
  });
}

function plainLines(text) {
  return String(text)
    .split("\n")
    .map((line) => ({ text: line, kind: "same" }));
}

export function diffXmlLines(prev, next) {
  const prevText = String(prev ?? "");
  const nextText = String(next ?? "");
  const prevLines = prevText.split("\n");
  const nextLines = nextText.split("\n");

  if (
    prevLines.length > MAX_DIFF_LINES ||
    nextLines.length > MAX_DIFF_LINES ||
    byteLength(prevText) > MAX_DIFF_BYTES ||
    byteLength(nextText) > MAX_DIFF_BYTES
  ) {
    return { lines: [...plainLines(prevText), ...plainLines(nextText)], truncated: true };
  }

  const m = prevLines.length;
  const n = nextLines.length;
  const width = n + 1;
  const dp = new Uint32Array((m + 1) * width);
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        prevLines[i] === nextLines[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  const lines = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (prevLines[i] === nextLines[j]) {
      lines.push({ text: prevLines[i], kind: "same", prevIndex: i, nextIndex: j });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      lines.push({ text: prevLines[i], kind: "removed", prevIndex: i });
      i += 1;
    } else {
      lines.push({ text: nextLines[j], kind: "added", nextIndex: j });
      j += 1;
    }
  }
  while (i < m) {
    lines.push({ text: prevLines[i], kind: "removed", prevIndex: i });
    i += 1;
  }
  while (j < n) {
    lines.push({ text: nextLines[j], kind: "added", nextIndex: j });
    j += 1;
  }

  return { lines, truncated: false };
}
