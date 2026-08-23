// PROCESSMAN-REDESIGN — безопасный markdown-рендер сообщений агента.
// Выбор: marked + isomorphic-dompurify.
// Обоснование по размеру: react-markdown тянет ~60 KB+ gzipped (unified/remark/rehype);
// marked ~12 KB + isomorphic-dompurify ~22 KB ≈ 34 KB, меньше и покрывает требуемые
// конструкции. HTML проходит DOMPurify — нет XSS через raw HTML.
import React, { useRef, useCallback } from "react";
import { Marked } from "marked";
import createDOMPurify from "dompurify";
import { splitTextByMentions } from "./chat/nodeMentions";

const FORBIDDEN_PROTOCOLS = /^(javascript|data|vbscript|about|blob):/i;
const ALLOWED_PROTOCOLS = /^(https?|mailto|\/)/i;

export function isAllowedHref(href) {
  const h = String(href || "").trim();
  if (!h) return false;
  if (FORBIDDEN_PROTOCOLS.test(h)) return false;
  return true;
}

export function normalizeHref(href) {
  const h = String(href || "").trim();
  if (!h) return "#";
  if (ALLOWED_PROTOCOLS.test(h)) return h;
  return `https://${h}`;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderNodeChip(id, name) {
  return `<button type="button" class="pm-processman-nodechip" data-testid="processman-node-chip-${escapeHtml(id)}" title="${escapeHtml(id)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></svg>${escapeHtml(name)}</button>`;
}

const markdownRenderer = {
  link({ href, text }) {
    if (!isAllowedHref(href)) {
      return `<span class="pm-processman-markdown__link-text">${text}</span>`;
    }
    return `<a class="pm-processman-markdown__link" href="${escapeHtml(normalizeHref(href))}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  },
  code({ text, lang }) {
    const langClass = lang ? ` language-${escapeHtml(lang)}` : "";
    return `<pre class="pm-processman-markdown__pre" data-testid="processman-markdown-pre"><code class="pm-processman-markdown__code-block${langClass}" data-testid="processman-markdown-code-block">${escapeHtml(text)}</code></pre>`;
  },
  codespan({ text }) {
    return `<code class="pm-processman-markdown__code">${escapeHtml(text)}</code>`;
  },
  strong({ text }) {
    return `<strong class="pm-processman-markdown__strong">${text}</strong>`;
  },
  em({ text }) {
    return `<em class="pm-processman-markdown__em">${text}</em>`;
  },
  paragraph({ text }) {
    return `<p class="pm-processman-markdown__p" data-testid="processman-markdown-p">${text}</p>`;
  },
  heading({ text, depth }) {
    const level = Math.min(Math.max(depth, 1), 6);
    return `<h${level} class="pm-processman-markdown__h${level}" data-testid="processman-markdown-h${level}">${text}</h${level}>`;
  },
  list({ body, ordered }) {
    const tag = ordered ? "ol" : "ul";
    const testId = ordered ? "processman-markdown-ol" : "processman-markdown-ul";
    return `<${tag} class="pm-processman-markdown__${tag}" data-testid="${testId}">${body}</${tag}>`;
  },
  listitem({ text }) {
    return `<li class="pm-processman-markdown__li">${text}</li>`;
  },
};

const md = new Marked({ renderer: markdownRenderer, gfm: true, breaks: false });

function getDOMPurify() {
  const win = typeof window !== "undefined" ? window : globalThis.window;
  if (!win) throw new Error("AgentMarkdown requires a browser/jsdom window");
  if (!win.__agentMarkdownDOMPurify) {
    win.__agentMarkdownDOMPurify = createDOMPurify(win);
  }
  return win.__agentMarkdownDOMPurify;
}

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "strong", "em", "b", "i", "code", "pre", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "a", "button", "span", "div",
    "svg", "path", "circle", "rect",
  ],
  ALLOWED_ATTR: [
    "class", "data-testid", "title", "type",
    "href", "target", "rel",
    "viewbox", "d", "cx", "cy", "r", "width", "height", "x", "y",
    "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  ],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|xxx|\/|#)|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

function renderInlineWithMentions(text, nodes) {
  const segments = splitTextByMentions(text, nodes);
  return segments
    .map((seg) => (seg.kind === "mention" ? renderNodeChip(seg.id, seg.name) : md.parseInline(seg.text)))
    .join("");
}

export function renderAgentMarkdown(text, { nodes } = {}) {
  // Сначала экранируем raw HTML-символы, чтобы любой HTML в ответе агента
  // рендерился как plain text, а не вставлялся в DOM. Markdown-конструкции
  // нашего supported subset (**, *, `, [], #, -, 1.) не используют < или >.
  const raw = escapeHtml(String(text || ""));
  if (!raw.trim()) return "";

  // marked по умолчанию оборачивает параграфы; mentions внутри параграфов
  // обрабатываются через кастомный renderer.paragraph. Однако parseInline
  // не создаёт параграфы, поэтому сначала даём marked построить blocks,
  // а inline-обработчику renderer'а (strong/em/codespan/link) передаём
  // уже распарсенный inline с упоминаниями.
  // Для этого переопределяем renderer.paragraph/heading/listitem так, чтобы
  // они сами вызывали renderInlineWithMentions, а inline-токены проходят
  // через renderer.strong/em/codespan/link.
  const renderer = {
    ...markdownRenderer,
    paragraph({ text }) {
      // text здесь — уже обработанный inline (strong/em/link/codespan).
      // Мы его игнорируем и строим inline заново с mentions.
      // Это неэффективно, но надёжно: исходный текст параграфа недоступен
      // после lexer, поэтому парсим блоки вручную.
      return text;
    },
  };

  // Пересобираем markdown block-by-block, сохраняя mentions и block-структуру.
  const lines = raw.split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const fenceMatch = line.match(/^```(.*)$/);
    if (fenceMatch) {
      const lang = fenceMatch[1].trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(renderer.code({ text: codeLines.join("\n"), lang }));
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInlineWithMentions(headingMatch[2].trim(), nodes);
      blocks.push(renderer.heading({ text: content, depth: level }));
      i += 1;
      continue;
    }

    const ulMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (ulMatch || olMatch) {
      const isOl = !!olMatch;
      const items = [];
      while (i < lines.length) {
        const current = lines[i];
        const m = isOl
          ? current.match(/^(\s*)\d+\.\s+(.*)$/)
          : current.match(/^(\s*)[-*]\s+(.*)$/);
        if (!m) break;
        items.push(`<li class="pm-processman-markdown__li">${renderInlineWithMentions(m[2], nodes)}</li>`);
        i += 1;
      }
      blocks.push(renderer.list({ body: items.join(""), ordered: isOl }));
      continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== "") {
      paraLines.push(lines[i]);
      i += 1;
    }
    const para = paraLines.join(" ");
    blocks.push(`<p class="pm-processman-markdown__p" data-testid="processman-markdown-p">${renderInlineWithMentions(para, nodes)}</p>`);
  }

  const dirty = blocks.join("\n");
  return getDOMPurify().sanitize(dirty, SANITIZE_CONFIG);
}

export default function AgentMarkdown({ text, nodes, onNodeClick }) {
  const html = renderAgentMarkdown(text, { nodes });
  const ref = useRef(null);

  const handleClick = useCallback((e) => {
    const chip = e.target.closest('button.pm-processman-nodechip');
    if (!chip) return;
    const testId = chip.getAttribute("data-testid") || "";
    const match = testId.match(/^processman-node-chip-(.+)$/);
    if (match) {
      e.stopPropagation();
      onNodeClick?.(match[1]);
    }
  }, [onNodeClick]);

  if (!html) return null;
  return (
    <span
      ref={ref}
      className="pm-processman-markdown"
      data-testid="processman-markdown"
      onClick={handleClick}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
