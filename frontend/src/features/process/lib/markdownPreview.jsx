function parseTableRow(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("|")) return [];
  const withoutStart = trimmed.slice(1);
  const withoutEnd = withoutStart.endsWith("|") ? withoutStart.slice(0, -1) : withoutStart;
  return withoutEnd.split("|").map((cell) => String(cell || "").trim());
}

function isTableDivider(line) {
  return /^\|\s*[-:| ]+\|?\s*$/.test(String(line || "").trim());
}

function headingClass(level) {
  if (level <= 1) return "text-2xl font-extrabold tracking-tight text-fg";
  if (level === 2) return "mt-6 text-xl font-bold text-fg";
  if (level === 3) return "mt-4 text-lg font-semibold text-fg";
  return "text-base font-semibold text-fg";
}

function renderInlineMarkdown(textRaw, keyPrefix = "md_inline") {
  const text = String(textRaw || "");
  if (!text) return "";
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let match;
  let idx = 0;
  while ((match = re.exec(text)) !== null) {
    const start = Number(match.index || 0);
    const token = String(match[0] || "");
    if (start > last) out.push(text.slice(last, start));
    if (token.startsWith("**") && token.endsWith("**")) {
      out.push(<strong key={`${keyPrefix}_b_${idx++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      out.push(<code key={`${keyPrefix}_c_${idx++}`} className="rounded bg-panel2 px-1 py-0.5 text-[0.95em]">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      out.push(<em key={`${keyPrefix}_i_${idx++}`}>{token.slice(1, -1)}</em>);
    } else {
      out.push(token);
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdownPreview(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const blocks = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = String(raw || "");
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const Tag = `h${Math.min(6, level)}`;
      blocks.push(
        <Tag key={`doc_h_${key++}`} className={headingClass(level)}>
          {renderInlineMarkdown(text, `doc_h_in_${key}`)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith("|")) {
      const tableLines = [];
      while (i < lines.length && String(lines[i] || "").trim().startsWith("|")) {
        tableLines.push(String(lines[i] || ""));
        i += 1;
      }
      const rows = tableLines.map(parseTableRow).filter((row) => row.length > 0);
      if (rows.length) {
        const header = rows[0];
        const dataStart = rows.length > 1 && isTableDivider(tableLines[1]) ? 2 : 1;
        const bodyRows = rows.slice(dataStart);
        blocks.push(
          <div key={`doc_tbl_${key++}`} className="overflow-auto rounded-xl border border-border">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-panel2">
                  {header.map((cell, idx) => (
                    <th key={`doc_th_${idx}`} className="border-b border-border px-3 py-2 text-left font-semibold text-fg">
                      {cell || " "}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rowIdx) => (
                  <tr key={`doc_tr_${rowIdx}`} className="odd:bg-panel/35">
                    {header.map((_, cellIdx) => (
                      <td key={`doc_td_${rowIdx}_${cellIdx}`} className="border-b border-border px-3 py-2 align-top text-fg/95">
                        {row[cellIdx] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(String(lines[i] || "").trim())) {
        const itemLine = String(lines[i] || "").trim();
        items.push(itemLine.replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={`doc_ol_${key++}`} className="list-decimal space-y-1 pl-6 text-sm text-fg/95">
          {items.map((item, idx) => (
            <li key={`doc_ol_i_${idx}`}>{renderInlineMarkdown(item, `doc_ol_i_in_${idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const items = [];
      while (i < lines.length && String(lines[i] || "").trim().startsWith("- ")) {
        const itemLine = String(lines[i] || "").trim();
        items.push(itemLine.slice(2).trim());
        i += 1;
      }
      blocks.push(
        <ul key={`doc_ul_${key++}`} className="list-disc space-y-1 pl-6 text-sm text-fg/95">
          {items.map((item, idx) => (
            <li key={`doc_ul_i_${idx}`}>{renderInlineMarkdown(item, `doc_ul_i_in_${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    blocks.push(
      <p key={`doc_p_${key++}`} className="text-sm leading-6 text-fg/95">
        {renderInlineMarkdown(trimmed, `doc_p_in_${key}`)}
      </p>,
    );
    i += 1;
  }

  return blocks;
}

export async function copyText(value) {
  const text = String(value || "");
  if (!text) return false;
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "readonly");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}
